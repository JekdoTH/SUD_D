// SUD-D Slice 2B-CODE. PRIVATE, UNCOMPILED Windows x64 supervisor candidate.
// Never link/register in production. No physical manifest or Owner authorization
// exists in this source. wmain deliberately has NO dispatch path.
// This source has NOT been compiled, ABI checked, or executed.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <Windows.h>
#include <processthreadsapi.h>
#include <jobapi2.h>
#include <sddl.h>
#include <algorithm>
#include <limits>
#include <string_view>
#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#ifndef _WIN64
#error SUD_D 2B proof supervisor is Windows x64 only
#endif

namespace sud_d_private_proof {
constexpr DWORD kMaxJobMembers = 8;
constexpr SIZE_T kMaxJobCommit = 512ull * 1024 * 1024;
constexpr DWORD kPollMs = 250;
constexpr DWORD kBootstrapMs = 5'000;
constexpr DWORD kLeaseMs = 8'000;
constexpr DWORD kOrdinaryMs = 30'000;
constexpr DWORD kTargetedMs = 60'000;
constexpr DWORD kCleanupMs = 10'000;
// Raw output retained by this proof: ZERO bytes. Counters only.
constexpr std::uint64_t kRawOutputRetained = 0;
constexpr std::uint64_t kMaxObservedOutput = 1024ull * 1024;
constexpr unsigned kMaxEvidenceFrames = 16;
constexpr unsigned kMaxFrameBytes = 4096;

namespace private_wire {
// Serialized bytes only: never send a C++ struct or raw inherited HANDLE here.
// Private cooperative fixture protocol, NOT authenticated Owner consent.
constexpr size_t kHeader = 108;
constexpr size_t kFrameMax = 4096;
constexpr unsigned short kVersion = 1;
enum class Role : unsigned short { observer=1, controller, supervisor, root, child, grandchild };
enum class Kind : unsigned short {
  hello=1, caseAdmit, reservationAck, registerHeld, observedAck, releaseResult,
  stop, heartbeat, evidence, auditAck, bye
};
using Digest = std::array<unsigned char, 32>;
using Epoch = std::array<unsigned char, 16>;
struct Frame {
  Kind kind = Kind::hello;
  Digest campaign{}, invocation{};
  Epoch epoch{};
  std::uint64_t sequence = 0;
  unsigned short caseNumber = 0, memberSlot = 0;
  Role sender = Role::observer;
  std::vector<unsigned char> payload;
};
static void put16(std::vector<unsigned char>& data, unsigned short v) {
  data.push_back(static_cast<unsigned char>(v));
  data.push_back(static_cast<unsigned char>(v >> 8));
}
static void put32(std::vector<unsigned char>& data, std::uint32_t v) {
  for (int i=0; i<4; ++i) data.push_back(static_cast<unsigned char>(v >> (i*8)));
}
static void put64(std::vector<unsigned char>& data, std::uint64_t v) {
  for (int i=0; i<8; ++i) data.push_back(static_cast<unsigned char>(v >> (i*8)));
}
static unsigned short read16(const unsigned char* p) {
  return static_cast<unsigned short>(p[0] | (static_cast<unsigned short>(p[1]) << 8));
}
static std::uint32_t read32(const unsigned char* p) {
  std::uint32_t v=0;
  for (int i=0;i<4;++i) v |= static_cast<std::uint32_t>(p[i]) << (i*8);
  return v;
}
static std::uint64_t read64(const unsigned char* p) {
  std::uint64_t v=0;
  for (int i=0;i<8;++i) v |= static_cast<std::uint64_t>(p[i]) << (i*8);
  return v;
}
static bool allows(Role sender, Kind kind) {
  switch (sender) {
    case Role::observer:
      return kind==Kind::hello || kind==Kind::observedAck || kind==Kind::stop ||
             kind==Kind::evidence || kind==Kind::bye;
    case Role::controller:
      return kind==Kind::hello || kind==Kind::caseAdmit || kind==Kind::heartbeat ||
             kind==Kind::stop || kind==Kind::bye;
    case Role::supervisor:
      return kind==Kind::hello || kind==Kind::reservationAck || kind==Kind::observedAck ||
             kind==Kind::releaseResult || kind==Kind::stop || kind==Kind::evidence ||
             kind==Kind::auditAck || kind==Kind::bye;
    case Role::root:
    case Role::child:
    case Role::grandchild:
      return kind==Kind::hello || kind==Kind::registerHeld || kind==Kind::bye;
  }
  return false;
}
// Payload is tightly typed by kind. No raw command, environment, or output.
static bool validPayload(Kind kind,size_t bytes) {
  switch(kind) {
    case Kind::hello: case Kind::caseAdmit: case Kind::stop:
    case Kind::heartbeat: case Kind::bye: return bytes==0;
    case Kind::reservationAck: case Kind::observedAck:
    case Kind::auditAck: return bytes==16;
    case Kind::registerHeld: return bytes==32;
    case Kind::releaseResult: case Kind::evidence: return bytes<=16;
  }
  return false;
}
static bool encode(const Frame& f, std::vector<unsigned char>& result) {
  if (f.payload.size() > kFrameMax-kHeader || f.sequence==0 ||
      f.caseNumber > 16 || !allows(f.sender,f.kind) ||
      !validPayload(f.kind,f.payload.size())) return false;
  result.clear(); result.reserve(kHeader+f.payload.size());
  result.insert(result.end(), {'S','U','D','D'});
  put16(result,kVersion); put16(result,static_cast<unsigned short>(f.kind));
  put32(result,static_cast<std::uint32_t>(f.payload.size()));
  result.insert(result.end(),f.campaign.begin(),f.campaign.end());
  result.insert(result.end(),f.invocation.begin(),f.invocation.end());
  result.insert(result.end(),f.epoch.begin(),f.epoch.end());
  put64(result,f.sequence);
  put16(result,f.caseNumber); put16(result,static_cast<unsigned short>(f.sender));
  put16(result,f.memberSlot); put16(result,0); // reserved must be zero
  if (result.size()!=kHeader) return false;
  result.insert(result.end(),f.payload.begin(),f.payload.end());
  return true;
}
struct Receiver {
  Digest campaign{}, invocation{};
  Epoch epoch{};
  std::uint64_t lastSequence=0;
  Role expectedSender=Role::controller;
  unsigned short expectedCase=0;
  bool bound=false; // becomes bound only from private bootstrap, not OWNER authority
};
static bool decode(const unsigned char* src, size_t length,
                   const Receiver& receiver, Frame& output) {
  if (!src || length<kHeader || length>kFrameMax ||
      src[0]!='S' || src[1]!='U' || src[2]!='D' || src[3]!='D' ||
      read16(src+4)!=kVersion || read32(src+8)!=length-kHeader ||
      read16(src+106)!=0) return false;
  const unsigned short rawKind=read16(src+6), rawRole=read16(src+102);
  if (rawKind<1 || rawKind>11 || rawRole<1 || rawRole>6) return false;
  Frame f{};
  f.kind=static_cast<Kind>(rawKind); f.sender=static_cast<Role>(rawRole);
  if (!allows(f.sender,f.kind) || !receiver.bound || f.sender!=receiver.expectedSender)
    return false;
  std::copy_n(src+12,32,f.campaign.begin());
  std::copy_n(src+44,32,f.invocation.begin());
  std::copy_n(src+76,16,f.epoch.begin());
  f.sequence=read64(src+92); f.caseNumber=read16(src+100);
  f.memberSlot=read16(src+104);
  if (f.caseNumber>16 || f.caseNumber!=receiver.expectedCase ||
      f.sequence==0 || f.sequence<=receiver.lastSequence ||
      f.campaign!=receiver.campaign || f.invocation!=receiver.invocation ||
      f.epoch!=receiver.epoch) return false;
  if (!validPayload(f.kind,length-kHeader)) return false;
  f.payload.assign(src+kHeader,src+length);
  output=std::move(f);
  return true;
}
static bool consume(Receiver& channel,const unsigned char* bytes,size_t length,
                    Frame& result) {
  if (!decode(bytes,length,channel,result)) return false;
  // Per-direction sequence commits once, after the *entire* frame validates.
  channel.lastSequence=result.sequence;
  return true;
}
static bool validateAck(const Frame& ack, Kind expected, std::uint64_t originalSequence,
                        std::uint64_t slotGeneration) {
  return ack.kind==expected && ack.payload.size()==16 &&
         read64(ack.payload.data())==originalSequence &&
         read64(ack.payload.data()+8)==slotGeneration;
}
} // namespace private_wire

class OwnedHandle final {
 public:
  OwnedHandle() = default;
  explicit OwnedHandle(HANDLE h) : value_(h) {}
  ~OwnedHandle() { reset(); }
  OwnedHandle(const OwnedHandle&) = delete;
  OwnedHandle& operator=(const OwnedHandle&) = delete;
  OwnedHandle(OwnedHandle&& other) noexcept : value_(other.release()) {}
  OwnedHandle& operator=(OwnedHandle&& other) noexcept {
    if (this != &other) reset(other.release());
    return *this;
  }
  HANDLE get() const { return value_; }
  explicit operator bool() const { return value_ && value_ != INVALID_HANDLE_VALUE; }
  HANDLE release() { HANDLE h = value_; value_ = nullptr; return h; }
  bool closeChecked() {
    if (!*this) { value_ = nullptr; return true; }
    HANDLE prior = release();
    return CloseHandle(prior) != FALSE;
  }
  void reset(HANDLE next = nullptr) {
    if (*this) CloseHandle(value_);
    value_ = next;
  }
 private:
  HANDLE value_ = nullptr;
};

// Inert recipe: no 'approved' or external Boolean can mint launch authority.
struct FrozenRecipe final {
  std::wstring absoluteExecutable;
  std::wstring fixedCommandLine;
  std::wstring canonicalWorkspace;
  std::vector<wchar_t> minimalUnicodeEnvironment; // double-NUL terminated
  private_wire::Digest invocationDigest{};
  ULONGLONG commandDeadlineMs = 0;
  ULONGLONG controllerLeaseUntilMs = 0;
};
enum class JournalState { absent, charged, creationIntentFlushed, held, terminal, unknown };
class PrivateJournal final {
 public:
  bool openExclusive(const std::wstring& futureReviewedMarkerPath) {
    if (marker_ || futureReviewedMarkerPath.empty()) return false;
    marker_.reset(CreateFileW(futureReviewedMarkerPath.c_str(), GENERIC_WRITE, 0,
                             nullptr, CREATE_NEW,
                             FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr));
    return static_cast<bool>(marker_);
  }
  // Fixed nonsecret records. Does not establish Owner/Kernel authorization.
  bool record(unsigned char type, const private_wire::Digest& digest) {
    if (!marker_ || state_==JournalState::unknown) return quarantine();
    JournalState next=JournalState::unknown;
    if (type==1 && state_==JournalState::absent) next=JournalState::charged;
    else if (type==2 && state_==JournalState::charged) next=JournalState::creationIntentFlushed;
    else if (type==3 && state_==JournalState::creationIntentFlushed) next=JournalState::held;
    else if (type==4 && state_==JournalState::held) next=JournalState::terminal;
    if (next==JournalState::unknown || (type!=1 && digest!=invocation_))
      return quarantine();
    std::array<unsigned char,37> bytes{};
    bytes[0]='S'; bytes[1]='U'; bytes[2]='D'; bytes[3]='J'; bytes[4]=type;
    std::copy(digest.begin(),digest.end(),bytes.begin()+5);
    DWORD written=0;
    if (!WriteFile(marker_.get(),bytes.data(),static_cast<DWORD>(bytes.size()),
                   &written,nullptr) || written!=bytes.size() ||
        !FlushFileBuffers(marker_.get())) return quarantine();
    if (type==1) invocation_=digest;
    state_=next;
    return true;
  }
  bool commitTerminal() { return record(4,invocation_); }
  bool creationCharged() const { return state_==JournalState::creationIntentFlushed; }
  bool quarantine() { state_=JournalState::unknown; return false; }
  JournalState status() const { return state_; }
  bool closeChecked() { return marker_.closeChecked(); }
 private:
  OwnedHandle marker_;
  private_wire::Digest invocation_{};
  JournalState state_=JournalState::absent;
};
// BLOCKER A1: no trusted Owner/Kernel issuer and native admission transport.
// An in-memory/journal record, hash, signature copied into a file or fixture
// nonce cannot stand in for Owner consent. Only a later reviewed bridge may bind.
class AdmissionBridge final {
 public:
  bool authenticatedOwnerAndKernel() const { return false; }
};
// BLOCKER S1: campaign-wide quarantine prohibits later cases after UNKNOWN.


struct OwnedPipes final {
  OwnedHandle parentStdinWrite;
  OwnedHandle parentStdoutRead;
  OwnedHandle parentStderrRead;
  OwnedHandle childStdinRead;
  OwnedHandle childStdoutWrite;
  OwnedHandle childStderrWrite;
};

static bool makePipes(OwnedPipes& p) {
  SECURITY_ATTRIBUTES inheritable{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
  HANDLE r = nullptr, w = nullptr;
  if (!CreatePipe(&r, &w, &inheritable, 0)) return false;
  p.childStdinRead.reset(r);
  p.parentStdinWrite.reset(w);
  if (!CreatePipe(&r, &w, &inheritable, 0)) return false;
  p.parentStdoutRead.reset(r);
  p.childStdoutWrite.reset(w);
  if (!CreatePipe(&r, &w, &inheritable, 0)) return false;
  p.parentStderrRead.reset(r);
  p.childStderrWrite.reset(w);
  // Only the three child ends may be inherited. No Job/controller/control
  // handle may be placed in PROC_THREAD_ATTRIBUTE_HANDLE_LIST.
  return SetHandleInformation(p.parentStdinWrite.get(), HANDLE_FLAG_INHERIT, 0)
    && SetHandleInformation(p.parentStdoutRead.get(), HANDLE_FLAG_INHERIT, 0)
    && SetHandleInformation(p.parentStderrRead.get(), HANDLE_FLAG_INHERIT, 0);
}

static OwnedHandle privateJob() {
  OwnedHandle job(CreateJobObjectW(nullptr, nullptr)); // unnamed, no public name
  if (!job || !SetHandleInformation(job.get(), HANDLE_FLAG_INHERIT, 0)) return {};
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags =
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
    | JOB_OBJECT_LIMIT_JOB_MEMORY;
  limits.BasicLimitInformation.ActiveProcessLimit = kMaxJobMembers;
  limits.JobMemoryLimit = kMaxJobCommit;
  if (!SetInformationJobObject(job.get(), JobObjectExtendedLimitInformation,
                               &limits, sizeof(limits))) return {};
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION readback{};
  if (!QueryInformationJobObject(job.get(), JobObjectExtendedLimitInformation,
                                 &readback, sizeof(readback), nullptr)) return {};
  const DWORD expected = limits.BasicLimitInformation.LimitFlags;
  const DWORD flags = readback.BasicLimitInformation.LimitFlags;
  if ((flags & expected) != expected ||
      (flags & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK)) ||
      readback.BasicLimitInformation.ActiveProcessLimit != kMaxJobMembers ||
      readback.JobMemoryLimit != kMaxJobCommit) return {};
  return job;
}

class Attributes final {
 public:
  Attributes() = default;
  Attributes(const Attributes&) = delete;
  Attributes& operator=(const Attributes&) = delete;
  ~Attributes() { if (ready_) DeleteProcThreadAttributeList(pointer()); }
  bool initialize(HANDLE job, const std::array<HANDLE, 3>& stdHandles) {
    SIZE_T bytes = 0;
    InitializeProcThreadAttributeList(nullptr, 2, 0, &bytes);
    if (!bytes) return false;
    storage_.resize((bytes+sizeof(std::uintptr_t)-1)/sizeof(std::uintptr_t));
    if (!InitializeProcThreadAttributeList(pointer(), 2, 0, &bytes)) return false;
    ready_ = true;
    job_ = job; // attribute references must outlive CreateProcessW
    handles_ = stdHandles;
    if (!UpdateProcThreadAttribute(pointer(), 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
                                   &job_, sizeof(job_), nullptr, nullptr)) return false;
    return UpdateProcThreadAttribute(pointer(), 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                    handles_.data(), sizeof(handles_), nullptr, nullptr) != FALSE;
  }
  LPPROC_THREAD_ATTRIBUTE_LIST pointer() {
    return reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage_.data());
  }
 private:
  std::vector<std::uintptr_t> storage_;
  HANDLE job_ = nullptr;
  std::array<HANDLE, 3> handles_{};
  bool ready_ = false;
};

struct ObservedMember {
  OwnedHandle process;           // DuplicateHandle from exact retained creator
  OwnedHandle primaryThread;     // duplicate of creator's actual thread handle
  FILETIME created{};
  ULONGLONG slotGeneration=0;
  bool observerAck=false;
  bool released=false;
};
static bool sameTokenUser(HANDLE candidate) {
  OwnedHandle selfToken, peerToken;
  HANDLE selfRaw=nullptr, peerRaw=nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &selfRaw)) return false;
  selfToken.reset(selfRaw);
  if (!OpenProcessToken(candidate, TOKEN_QUERY, &peerRaw)) return false;
  peerToken.reset(peerRaw);
  DWORD leftBytes=0,rightBytes=0;
  GetTokenInformation(selfToken.get(),TokenUser,nullptr,0,&leftBytes);
  GetTokenInformation(peerToken.get(),TokenUser,nullptr,0,&rightBytes);
  if (!leftBytes || !rightBytes || leftBytes>4096 || rightBytes>4096) return false;
  std::vector<unsigned char> left(leftBytes),right(rightBytes);
  if (!GetTokenInformation(selfToken.get(),TokenUser,left.data(),leftBytes,&leftBytes)
   || !GetTokenInformation(peerToken.get(),TokenUser,right.data(),rightBytes,&rightBytes))
    return false;
  auto* a=reinterpret_cast<TOKEN_USER*>(left.data());
  auto* b=reinterpret_cast<TOKEN_USER*>(right.data());
  return EqualSid(a->User.Sid,b->User.Sid)!=FALSE;
}
static bool verifyHeldMember(HANDLE process, HANDLE thread, HANDLE job,
                             const std::wstring& expectedAbsoluteImage, FILETIME& creation) {
  if (!process || !thread || !job || expectedAbsoluteImage.empty()) return false;
  BOOL inJob=FALSE;
  if (!IsProcessInJob(process,job,&inJob) || !inJob ||
      GetProcessIdOfThread(thread)!=GetProcessId(process)) return false;
  FILETIME exit{},kernel{},user{};
  if (!GetProcessTimes(process,&creation,&exit,&kernel,&user)) return false;
  std::vector<wchar_t> image(32768);
  DWORD length=static_cast<DWORD>(image.size());
  if (!QueryFullProcessImageNameW(process,0,image.data(),&length) ||
      _wcsicmp(std::wstring(image.data(),length).c_str(),
                expectedAbsoluteImage.c_str())!=0) return false;
  // Same user is only a fixture token consistency check, not Owner consent.
  return sameTokenUser(process);
}
struct HeldCommand final {
  OwnedHandle job;
  OwnedHandle root;
  OwnedHandle primaryThread;
  OwnedPipes pipes;
  DWORD rootPidForDiagnosticsOnly = 0;
  FILETIME rootCreation{};
  std::array<ObservedMember, kMaxJobMembers> members{};
  bool membershipObserved = false;
  bool rootObserverAck = false;
  OwnedHandle controllerExclusiveRead; // only C owns the writer; no duplicates
  bool creationFenced = true;
  bool released = false;
  bool stopRequested = false;
  bool finalizingStarted = false; // protected by releaseFence, independent of stop
  bool unknown = false;
  // Owns all post-publication stop, ACK, release, creation and finalization decisions.
  std::mutex releaseFence;
};

// Must be called only from a future sealed-authority bridge, currently ABSENT.
// False is NO-GO, never a signal to retry without JOB_LIST / HANDLE_LIST.
static bool prepareHeld(const FrozenRecipe& recipe, HeldCommand& owned,
                        const PrivateJournal& journal, const AdmissionBridge& admission) {
  // Source-only: this admission bridge is deliberately unbound (A1).
  if (!admission.authenticatedOwnerAndKernel() || !journal.creationCharged() ||
      recipe.absoluteExecutable.empty() || recipe.canonicalWorkspace.empty() ||
      recipe.fixedCommandLine.empty() || recipe.minimalUnicodeEnvironment.size() < 2 ||
      recipe.minimalUnicodeEnvironment.back() != L'\0' ||
      recipe.minimalUnicodeEnvironment[recipe.minimalUnicodeEnvironment.size() - 2] != L'\0' ||
      !recipe.commandDeadlineMs || !recipe.controllerLeaseUntilMs ||
      GetTickCount64() >= recipe.commandDeadlineMs ||
      GetTickCount64() >= recipe.controllerLeaseUntilMs) return false;
  owned.job = privateJob();
  if (!owned.job || !makePipes(owned.pipes)) return false;
  const std::array<HANDLE, 3> inherited = {
    owned.pipes.childStdinRead.get(), owned.pipes.childStdoutWrite.get(),
    owned.pipes.childStderrWrite.get(),
  };
  Attributes attributes;
  if (!attributes.initialize(owned.job.get(), inherited)) return false;

  STARTUPINFOEXW si{};
  si.StartupInfo.cb = sizeof(si);
  si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  si.StartupInfo.hStdInput = inherited[0];
  si.StartupInfo.hStdOutput = inherited[1];
  si.StartupInfo.hStdError = inherited[2];
  si.lpAttributeList = attributes.pointer();
  std::vector<wchar_t> command(recipe.fixedCommandLine.begin(), recipe.fixedCommandLine.end());
  command.push_back(L'\0'); // CreateProcessW requires mutable command line
  PROCESS_INFORMATION created{};
  const DWORD flags = CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT |
                      CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW;
  if (!CreateProcessW(recipe.absoluteExecutable.c_str(), command.data(),
                      nullptr, nullptr, TRUE, flags,
                      const_cast<wchar_t*>(recipe.minimalUnicodeEnvironment.data()),
                      recipe.canonicalWorkspace.c_str(), &si.StartupInfo, &created)) {
    return false; // attempt remains charged; no AssignProcessToJobObject fallback
  }
  owned.root.reset(created.hProcess); // actual creation handle, not OpenProcess(PID)
  owned.primaryThread.reset(created.hThread);
  owned.rootPidForDiagnosticsOnly = created.dwProcessId;
  owned.pipes.childStdinRead.reset();
  owned.pipes.childStdoutWrite.reset();
  owned.pipes.childStderrWrite.reset();
  BOOL inJob = FALSE;
  if (!IsProcessInJob(owned.root.get(), owned.job.get(), &inJob) || !inJob) {
    owned.unknown = true;
    TerminateJobObject(owned.job.get(), 1);
    return false;
  }
  owned.membershipObserved = verifyHeldMember(owned.root.get(),
    owned.primaryThread.get(),owned.job.get(),recipe.absoluteExecutable,
    owned.rootCreation);
  if (!owned.membershipObserved) {
    owned.unknown = true;
    TerminateJobObject(owned.job.get(),1);
    return false;
  }
  // This verifies *local OS observations* only. A1 admission and observer ACK
  // still block release; no caller-provided verified booleans are accepted.
  return true;
}

// Private forward declaration: ACK verification uses this helper below.
static bool exactPipePeer(HANDLE pipe, HANDLE retainedCreator, FILETIME expectedCreation);

// An ACK must have passed strict wire decoding and named-pipe peer validation.
// Sequence and slot generation bind it to one held object, not Owner consent.
static bool acknowledgeRootObservation(HeldCommand& owned,
                                       private_wire::Receiver& channel,
                                       HANDLE observerPipe,HANDLE retainedObserver,
                                       FILETIME observerCreated,
                                       const unsigned char* packet,size_t packetLength,
                                       std::uint64_t offerSequence,
                                       std::uint64_t slotGeneration) {
  // Consult named-pipe/OS peer identity outside the release fence: no pipe
  // operation may block another thread trying to stop/finalize this command.
  if (!exactPipePeer(observerPipe,retainedObserver,observerCreated)) return false;
  std::lock_guard<std::mutex> guard(owned.releaseFence);
  if (owned.stopRequested || owned.finalizingStarted || owned.released ||
      !owned.membershipObserved) return false;
  private_wire::Frame ack{};
  if (!private_wire::consume(channel,packet,packetLength,ack) ||
      ack.sender!=private_wire::Role::observer ||
      !private_wire::validateAck(ack,private_wire::Kind::observedAck,
                                 offerSequence,slotGeneration)) return false;
  owned.rootObserverAck=true;
  return true;
}
// Private first-instance fixture pipe. A verified logon-SID ACL narrows
// cooperative peer access; it is NOT hostile same-user or Owner authentication.
static OwnedHandle createPrivateRegistrationPipe(const std::wstring& frozenName) {
  if (frozenName.rfind(L"\\\\.\\pipe\\",0)!=0 || frozenName.size()>240) return {};
  HANDLE tokenRaw=nullptr;
  if (!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&tokenRaw)) return {};
  OwnedHandle token(tokenRaw);
  DWORD length=0;
  GetTokenInformation(token.get(),TokenGroups,nullptr,0,&length);
  if (length<sizeof(TOKEN_GROUPS) || length>65536) return {};
  std::vector<unsigned char> data(length);
  if (!GetTokenInformation(token.get(),TokenGroups,data.data(),length,&length)) return {};
  auto* groups=reinterpret_cast<TOKEN_GROUPS*>(data.data());
  PSID logon=nullptr;
  for (DWORD i=0;i<groups->GroupCount;++i) {
    if ((groups->Groups[i].Attributes & SE_GROUP_LOGON_ID)==SE_GROUP_LOGON_ID) {
      logon=groups->Groups[i].Sid; break;
    }
  }
  if (!logon) return {};
  LPWSTR sidText=nullptr;
  if (!ConvertSidToStringSidW(logon,&sidText)) return {};
  const std::wstring sddl=L"D:P(A;;GA;;;SY)(A;;GA;;;" + std::wstring(sidText) + L")";
  LocalFree(sidText);
  PSECURITY_DESCRIPTOR descriptor=nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
        sddl.c_str(),SDDL_REVISION_1,&descriptor,nullptr)) return {};
  SECURITY_ATTRIBUTES attr{sizeof(SECURITY_ATTRIBUTES),descriptor,FALSE};
  OwnedHandle result(CreateNamedPipeW(
    frozenName.c_str(),PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
    1,static_cast<DWORD>(private_wire::kFrameMax),
    static_cast<DWORD>(private_wire::kFrameMax),5000,&attr));
  LocalFree(descriptor);
  return result;
}
static bool exactPipePeer(HANDLE pipe,HANDLE retainedCreator,FILETIME expectedCreation) {
  if (!pipe || !retainedCreator) return false;
  ULONG clientPid=0;
  if (!GetNamedPipeClientProcessId(pipe,&clientPid) ||
      clientPid!=GetProcessId(retainedCreator)) return false;
  FILETIME created{},exited{},kernel{},user{};
  return GetProcessTimes(retainedCreator,&created,&exited,&kernel,&user) &&
         CompareFileTime(&created,&expectedCreation)==0;
}

// Source-supplied handle integers are never opened as standalone PIDs: the
// process source is retained from actual creation and requires DUP_HANDLE.
struct HeldMemberOffer {
  unsigned short slot=0;
  std::uint64_t generation=0, originalSequence=0;
  HANDLE sourceProcessValue=nullptr;
  HANDLE sourceThreadValue=nullptr;
};
static bool captureMemberFromExactCreator(
    HeldCommand& owner,HANDLE retainedCreatorProcess,FILETIME creatorCreated,
    HANDLE registrationPipe,const HeldMemberOffer& offer,
    const std::wstring& pinnedImage,ObservedMember& out) {
  // A native peer query and exact-handle duplication are made outside the
  // release fence; publication below is atomic with STOP/finalization.
  if (!exactPipePeer(registrationPipe,retainedCreatorProcess,creatorCreated) ||
      !retainedCreatorProcess || !offer.sourceProcessValue ||
      !offer.sourceThreadValue || offer.generation==0) return false;
  OwnedHandle observedJob;
  {
    std::lock_guard<std::mutex> lock(owner.releaseFence);
    if (owner.stopRequested || owner.finalizingStarted ||
        owner.creationFenced || owner.unknown || !owner.job || out.process)
      return false;
    HANDLE duplicated=nullptr;
    if (!DuplicateHandle(GetCurrentProcess(),owner.job.get(),
                         GetCurrentProcess(),&duplicated,0,FALSE,
                         DUPLICATE_SAME_ACCESS)) return false;
    observedJob.reset(duplicated); // retains object during unlocked OS checks
  }
  HANDLE processRaw=nullptr,threadRaw=nullptr;
  constexpr DWORD rights=PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE |
                          PROCESS_DUP_HANDLE | SYNCHRONIZE;
  if (!DuplicateHandle(retainedCreatorProcess,offer.sourceProcessValue,
                       GetCurrentProcess(),&processRaw,rights,FALSE,0)) return false;
  OwnedHandle process(processRaw);
  if (!DuplicateHandle(retainedCreatorProcess,offer.sourceThreadValue,
                       GetCurrentProcess(),&threadRaw,
                       THREAD_QUERY_LIMITED_INFORMATION | THREAD_SUSPEND_RESUME | SYNCHRONIZE,
                       FALSE,0)) return false;
  OwnedHandle thread(threadRaw);
  FILETIME created{};
  if (!verifyHeldMember(process.get(),thread.get(),observedJob.get(),pinnedImage,created))
    return false;
  std::lock_guard<std::mutex> lock(owner.releaseFence);
  if (owner.stopRequested || owner.finalizingStarted ||
      owner.creationFenced || owner.unknown || !owner.job || out.process)
    return false; // temporary exact duplicates auto-close, never publish late
  out.process=std::move(process); out.primaryThread=std::move(thread);
  out.created=created; out.slotGeneration=offer.generation;
  // No ack is manufactured. Release remains fenced until O validates the
  // reduced exact observation object and returns matching OBSERVED_ACK.
  return true;
}
static bool acknowledgeRegisteredMember(HeldCommand& owner,ObservedMember& member,
                                        private_wire::Receiver& channel,
                                        HANDLE observerPipe,HANDLE observerExact,
                                        FILETIME observerCreated,
                                        const unsigned char* packet,size_t length,
                                        std::uint64_t offerSequence) {
  if (!exactPipePeer(observerPipe,observerExact,observerCreated)) return false;
  std::lock_guard<std::mutex> guard(owner.releaseFence);
  if (owner.stopRequested || owner.finalizingStarted || owner.unknown ||
      !member.process || !member.primaryThread ||
      member.observerAck || member.released) return false;
  private_wire::Frame ack{};
  if (!private_wire::consume(channel,packet,length,ack) ||
      ack.sender!=private_wire::Role::observer ||
      !private_wire::validateAck(ack,private_wire::Kind::observedAck,
                                 offerSequence,member.slotGeneration)) return false;
  member.observerAck=true;
  return true;
}
static bool resumeRegisteredMemberOnce(HeldCommand& owner,ObservedMember& member,
                                       const FrozenRecipe& recipe,
                                       const AdmissionBridge& admission) {
  std::lock_guard<std::mutex> lock(owner.releaseFence); // same STOP/creation fence
  FILETIME creation{};
  if (!admission.authenticatedOwnerAndKernel() ||
      owner.stopRequested || owner.finalizingStarted ||
      owner.creationFenced || owner.unknown ||
      !member.process || !member.primaryThread ||
      !member.observerAck || member.released ||
      GetTickCount64()>=recipe.commandDeadlineMs ||
      !verifyHeldMember(member.process.get(),member.primaryThread.get(),
                        owner.job.get(),recipe.absoluteExecutable,creation) ||
      CompareFileTime(&creation,&member.created)!=0) return false;
  const DWORD count=ResumeThread(member.primaryThread.get());
  if (count!=1) {
    owner.unknown=true; owner.stopRequested=true; owner.creationFenced=true;
    if (owner.job) TerminateJobObject(owner.job.get(),1);
    return false;
  }
  member.released=true;
  return true;
}

static bool releaseHeldOnce(HeldCommand& owned, const FrozenRecipe& recipe,
                            const PrivateJournal& journal, const AdmissionBridge& admission) {
  OwnedHandle controllerProbe;
  {
    std::lock_guard<std::mutex> guard(owned.releaseFence);
    if (owned.stopRequested || owned.finalizingStarted || owned.released ||
        owned.unknown || !owned.controllerExclusiveRead) return false;
    HANDLE duplicate=nullptr;
    if (!DuplicateHandle(GetCurrentProcess(),owned.controllerExclusiveRead.get(),
                         GetCurrentProcess(),&duplicate,0,FALSE,
                         DUPLICATE_SAME_ACCESS)) return false;
    controllerProbe.reset(duplicate);
  }
  // Potentially blocking pipe observation must never own the releaseFence.
  DWORD available=0;
  if (!PeekNamedPipe(controllerProbe.get(),nullptr,0,nullptr,&available,nullptr))
    return false;
  std::lock_guard<std::mutex> guard(owned.releaseFence); // final release/STOP commit
  FILETIME reconfirmed{};
  if (!admission.authenticatedOwnerAndKernel() || !journal.creationCharged() ||
      !owned.job || !owned.root || !owned.primaryThread ||
      owned.stopRequested || owned.finalizingStarted ||
      owned.released || owned.unknown ||
      !owned.membershipObserved || !owned.rootObserverAck ||
      !owned.controllerExclusiveRead ||
      !verifyHeldMember(owned.root.get(),owned.primaryThread.get(),owned.job.get(),
                        recipe.absoluteExecutable,reconfirmed) ||
      CompareFileTime(&reconfirmed,&owned.rootCreation)!=0 ||
      GetTickCount64() >= recipe.commandDeadlineMs ||
      GetTickCount64() >= recipe.controllerLeaseUntilMs) return false;
  const DWORD previous=ResumeThread(owned.primaryThread.get());
  if (previous!=1) {
    owned.unknown=true; owned.stopRequested=true;
    TerminateJobObject(owned.job.get(),1);
    return false; // never try to resume a second time
  }
  owned.released=true;
  return true;
}
static void fenceAndStop(HeldCommand& owned) {
  std::lock_guard<std::mutex> guard(owned.releaseFence);
  owned.stopRequested = true;
  owned.creationFenced = true;
  if (owned.job) TerminateJobObject(owned.job.get(), 1);
}

// Explicitly separate root exit and still-owned Job-zero. Completion-port
// messages and TerminateJobObject alone are never proof.
static bool rootExited(HeldCommand& owned, DWORD& code) {
  if (!owned.root || WaitForSingleObject(owned.root.get(), 0) != WAIT_OBJECT_0) return false;
  // A signaled exact process handle is terminal. Exit code 259 is a legitimate
  // numeric exit code; STILL_ACTIVE only has meaning before handle signaling.
  return GetExitCodeProcess(owned.root.get(), &code) != FALSE;
}
static bool jobDrainedAfterFence(HeldCommand& owned,bool fencedByOwner) {
  // The caller establishes the creation/finalization fence under releaseFence
  // before this unlocked OS query. No concurrent unlocked bool reads.
  if (!fencedByOwner || !owned.job) return false;
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
  if (!QueryInformationJobObject(owned.job.get(), JobObjectBasicAccountingInformation,
                                 &info, sizeof(info), nullptr)) return false;
  return info.ActiveProcesses == 0;
}

// Nonblocking bounded metadata queue. No raw command text, stdout, stderr,
// credentials, handles or caller-authored arbitrary fields enter this buffer.
enum class SafeEvidenceKind : unsigned { rootExit, jobZero, ioJoined, resourceClosed, auditStatus, stopReason };
struct SafeEvidenceFrame {
  SafeEvidenceKind kind = SafeEvidenceKind::stopReason;
  std::uint64_t boundedCounter = 0;
};
class SafeEvidenceQueue final {
 public:
  bool tryPush(SafeEvidenceFrame frame) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (count_ >= kMaxEvidenceFrames || sizeof(frame) > kMaxFrameBytes) return false;
    frames_[tail_] = frame;
    tail_ = (tail_ + 1) % kMaxEvidenceFrames;
    ++count_;
    return true;
  }
  bool tryPop(SafeEvidenceFrame& value) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!count_) return false;
    value = frames_[head_];
    head_ = (head_ + 1) % kMaxEvidenceFrames;
    --count_;
    return true;
  }
 private:
  std::array<SafeEvidenceFrame, kMaxEvidenceFrames> frames_{};
  unsigned head_ = 0, tail_ = 0, count_ = 0;
  std::mutex mutex_;
};
static std::uint64_t addObservedSaturated(std::atomic<std::uint64_t>& counter,
                                          std::uint64_t bytes) {
  auto old = counter.load();
  for (;;) {
    const auto room = (std::numeric_limits<std::uint64_t>::max)() - old;
    const auto next = old + (std::min)(bytes, room);
    if (counter.compare_exchange_weak(old, next)) return next;
  }
}
struct PipeReader final {
  HANDLE readEnd = nullptr; // borrowed; owner may close ONLY after thread join
  std::atomic<std::uint64_t>* observed = nullptr;
  std::atomic<bool>* overflow = nullptr;
  HANDLE finishedEvent = nullptr;
};
static DWORD WINAPI drainPipe(LPVOID param) {
  auto* context = static_cast<PipeReader*>(param);
  std::array<char, 4096> discarded{};
  DWORD read = 0;
  while (ReadFile(context->readEnd, discarded.data(),
                  static_cast<DWORD>(discarded.size()), &read, nullptr) && read) {
    const auto total = addObservedSaturated(*context->observed,read);
    if (total > kMaxObservedOutput) context->overflow->store(true);
    // Intentionally DISCARD bytes. Never persist raw stdout/stderr or secrets.
  }
  SetEvent(context->finishedEvent);
  return 0;
}

// Pipes and reader contexts must outlive all threads. A failed join cannot
// be handled by freeing borrowed buffers or claiming I/O quiescence.
[[noreturn]] static void failStoppedSupervisor() {
  // A live reader may still reference stack/heap buffers. Never unwind the
  // CRT, close borrowed pipes, or fabricate a clean receipt after join failure.
  TerminateProcess(GetCurrentProcess(),ERROR_OPERATION_ABORTED);
  for (;;) Sleep(INFINITE); // if OS termination unexpectedly does not complete
}
static DWORD remainingMs(ULONGLONG absoluteMs) {
  const auto now=GetTickCount64();
  return now>=absoluteMs ? 0 : static_cast<DWORD>(
    (std::min)(absoluteMs-now,static_cast<ULONGLONG>(MAXDWORD)));
}
static void stopReadersAndJoin(HANDLE stdoutThread,HANDLE stderrThread,
                               ULONGLONG sharedCleanupDeadline) {
  if (stdoutThread) CancelSynchronousIo(stdoutThread); // request only
  if (stderrThread) CancelSynchronousIo(stderrThread);
  if (stdoutThread &&
      WaitForSingleObject(stdoutThread,remainingMs(sharedCleanupDeadline))!=WAIT_OBJECT_0)
    failStoppedSupervisor();
  if (stderrThread &&
      WaitForSingleObject(stderrThread,remainingMs(sharedCleanupDeadline))!=WAIT_OBJECT_0)
    failStoppedSupervisor();
}
struct ReadWorkers final {
  OwnedHandle stdoutThread,stderrThread,stdoutFinished,stderrFinished;
  std::atomic<std::uint64_t> observed{0};
  std::atomic<bool> overflow{false};
  PipeReader stdoutCtx{},stderrCtx{};
  bool joined=false;
  ReadWorkers()=default;
  ReadWorkers(const ReadWorkers&)=delete;
  ReadWorkers& operator=(const ReadWorkers&)=delete;
  ~ReadWorkers() {
    if ((stdoutThread || stderrThread) && !joined) failStoppedSupervisor();
  }
  bool begin(HeldCommand& owned) {
    if (!owned.pipes.parentStdoutRead || !owned.pipes.parentStderrRead ||
        stdoutThread || stderrThread) return false;
    stdoutFinished.reset(CreateEventW(nullptr,TRUE,FALSE,nullptr));
    stderrFinished.reset(CreateEventW(nullptr,TRUE,FALSE,nullptr));
    if (!stdoutFinished || !stderrFinished) return false;
    stdoutCtx={owned.pipes.parentStdoutRead.get(),&observed,&overflow,stdoutFinished.get()};
    stderrCtx={owned.pipes.parentStderrRead.get(),&observed,&overflow,stderrFinished.get()};
    stdoutThread.reset(CreateThread(nullptr,0,drainPipe,&stdoutCtx,0,nullptr));
    if (!stdoutThread) return false;
    stderrThread.reset(CreateThread(nullptr,0,drainPipe,&stderrCtx,0,nullptr));
    if (!stderrThread) {
      stopReadersAndJoin(stdoutThread.get(),nullptr,GetTickCount64()+kCleanupMs);
      joined=true;
      return false;
    }
    return true;
  }
  bool joinUntil(ULONGLONG commonDeadline) {
    const bool bothStarted=stdoutThread && stderrThread;
    stopReadersAndJoin(stdoutThread.get(),stderrThread.get(),commonDeadline);
    joined=true; // actual thread objects were observed signaled
    const bool a=stdoutThread.closeChecked();
    const bool b=stderrThread.closeChecked();
    const bool c=stdoutFinished.closeChecked();
    const bool d=stderrFinished.closeChecked();
    return bothStarted && a && b && c && d;
  }
};

struct WatchdogContext final {
  HeldCommand* command = nullptr;
  HANDLE controllerExclusiveRead = nullptr; // private; no other writer retained
  std::atomic<ULONGLONG>* leaseEndMs = nullptr;
  std::atomic<bool>* auditFailure = nullptr;
  std::atomic<bool>* overflow = nullptr;
  HANDLE exitEvent = nullptr;
  ULONGLONG absoluteDeadlineMs = 0;
};
static DWORD WINAPI independentWatchdog(LPVOID opaque) {
  auto* ctx = static_cast<WatchdogContext*>(opaque);
  if (!ctx || !ctx->command || !ctx->leaseEndMs || !ctx->auditFailure ||
      !ctx->overflow || !ctx->exitEvent || !ctx->controllerExclusiveRead) return ERROR_INVALID_PARAMETER;
  for (;;) {
    if (WaitForSingleObject(ctx->exitEvent, kPollMs) == WAIT_OBJECT_0) return ERROR_SUCCESS;
    DWORD available = 0;
    const bool controllerLost = !PeekNamedPipe(ctx->controllerExclusiveRead, nullptr, 0,
                                                nullptr, &available, nullptr);
    const ULONGLONG now = GetTickCount64();
    if (controllerLost || ctx->auditFailure->load() || ctx->overflow->load() ||
        now >= ctx->absoluteDeadlineMs || now >= ctx->leaseEndMs->load()) {
      fenceAndStop(*ctx->command);
      return ERROR_OPERATION_ABORTED;
    }
  }
}

struct NativeObservation final {
  DWORD exactRootExitCode=0;
  bool rootSignaled=false, jobZero=false;
  bool ioThreadsJoined=false, explicitHandlesClosed=false;
  bool fixtureJournalFlushed=false, externalAuditCommitted=false;
  bool ownershipUnknown=true, stoppedOrTimedOut=true;
};
enum class NativeOutcome { unknown, failed, canceled, succeeded };
static NativeOutcome classifyObserved(const NativeObservation& e) {
  if (e.ownershipUnknown || !e.externalAuditCommitted || !e.fixtureJournalFlushed)
    return NativeOutcome::unknown;
  if (!e.rootSignaled || !e.jobZero || !e.ioThreadsJoined ||
      !e.explicitHandlesClosed) return NativeOutcome::unknown;
  if (e.stoppedOrTimedOut) return NativeOutcome::canceled;
  return e.exactRootExitCode==0 ? NativeOutcome::succeeded : NativeOutcome::failed;
}
// Exact native observations must precede job handle closure. No caller can
// manufacture externalAuditCommitted here: A1 admission/audit bridge is absent.
static NativeObservation collectLocalCleanup(HeldCommand& command,
                                             ReadWorkers& readers,
                                             PrivateJournal& localJournal,
                                             ULONGLONG sharedDeadline) {
  NativeObservation e{};
  {
    std::lock_guard<std::mutex> lock(command.releaseFence);
    if (command.finalizingStarted) return e; // second finalizer never takes custody
    command.finalizingStarted=true; // single serialized fence, NOT cancellation
    command.creationFenced=true;   // stop further descendant admission
  }
  // OS observations (including zero-timeout wait and Job queries) occur only
  // after publication is fenced; no native wait or pipe operation holds mutex.
  DWORD code=0;
  e.rootSignaled=rootExited(command,code);
  if (e.rootSignaled) e.exactRootExitCode=code; // including signaled exit 259
  e.jobZero=jobDrainedAfterFence(command,true);
  if (!e.jobZero && command.job) TerminateJobObject(command.job.get(),1);
  // CancelSynchronousIo is merely a request; ReadWorkers requires an actual
  // signaled thread handle before returning, else terminates non-returning.
  e.ioThreadsJoined=readers.joinUntil(sharedDeadline);
  {
    // Explicit close and final state snapshot share the release/stop fence.
    // Reader joins and journal flushing are OUTSIDE this critical section.
    std::lock_guard<std::mutex> lock(command.releaseFence);
    const bool rootClosed=command.root.closeChecked();
    const bool primaryClosed=command.primaryThread.closeChecked();
    const bool stdinClosed=command.pipes.parentStdinWrite.closeChecked();
    const bool stdoutClosed=command.pipes.parentStdoutRead.closeChecked();
    const bool stderrClosed=command.pipes.parentStderrRead.closeChecked();
    const bool childInClosed=command.pipes.childStdinRead.closeChecked();
    const bool childOutClosed=command.pipes.childStdoutWrite.closeChecked();
    const bool childErrClosed=command.pipes.childStderrWrite.closeChecked();
    bool membersClosed=true;
    for (auto& member:command.members) {
      const bool threadClosed=member.primaryThread.closeChecked();
      const bool processClosed=member.process.closeChecked();
      membersClosed=threadClosed && processClosed && membersClosed;
    }
    const bool controllerClosed=command.controllerExclusiveRead.closeChecked();
    const bool jobClosed=command.job.closeChecked(); // AFTER still-owned Job query
    e.explicitHandlesClosed=rootClosed && primaryClosed && stdinClosed &&
      stdoutClosed && stderrClosed && childInClosed && childOutClosed &&
      childErrClosed && membersClosed && controllerClosed && jobClosed;
    e.ownershipUnknown=command.unknown || !e.rootSignaled || !e.jobZero ||
      !e.ioThreadsJoined || !e.explicitHandlesClosed;
    e.stoppedOrTimedOut=command.stopRequested;
  }
  // Local journal is not a durable authenticated Owner audit. A separate
  // future facade must record/verify its own audit before PASS.
  e.fixtureJournalFlushed = e.ioThreadsJoined && e.explicitHandlesClosed &&
    localJournal.status()==JournalState::held &&
    localJournal.commitTerminal();
  return e;
}

// Remaining physical gates intentionally NOT wired: exact observer controller
// handshake, native creator-held descendant duplication, durable attempt/audit
// journal, sealed manifest binding, full I/O thread lifetime, and signing.
// All require separately accepted BUILD/PREP+PHYS scopes. There is no callable
// physical entry point under this assignment.
} // namespace sud_d_private_proof

int wmain(int /*argc*/, wchar_t** /*argv*/) {
  // Safe even if someone separately compiles this without authorisation:
  // no arguments, environment flag, or model text can enable the native path.
  return ERROR_ACCESS_DISABLED_BY_POLICY;
}
