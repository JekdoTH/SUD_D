// SUD-D Slice 2B-CODE: PRIVATE fixture/observer/controller source candidate.
// UNCOMPILED, UNRUN, not linked to any product module or launcher.
// A future Owner-approved frozen manifest and 2B-PHYS admission bridge are
// required. This proof can never authenticate existing SUD-D production tools.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <Windows.h>
#include <sddl.h>
#include <algorithm>
#include <atomic>
#include <mutex>
#include <array>
#include <cstdint>
#include <limits>
#include <string>
#include <vector>

#ifndef _WIN64
#error SUD_D private proof fixture requires x64 Windows
#endif
namespace sud_d_private_fixture {
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

enum class Role { observer, controller, supervisor, root, child, grandchild, targeted };
enum class CaseId {
  z1, z2, normalTree, rootBeforeDescendants, invalidFixedExecutable,
  controllerDeath, controllerStall, absoluteDeadline, cancelHeld, cancelRunning,
  floodBothStreams, runningAuditFailure, directBreakaway, targetedAddition,
  z3, z4, supervisorDeathLast
};
struct CaseSpec {
  const wchar_t* id;
  CaseId kind;
  const wchar_t* fixedRecipe;
  unsigned commandRootRequests;
  unsigned descendantRequestCeiling;
  bool mustRunLast;
};
// Declarative source-level matrix. These numbers are proposed PROOF ceilings,
// NOT physical attempt authorisation, process counts, or admission receipts.
constexpr std::array<CaseSpec, 17> kMatrix{{
  {L"Z1", CaseId::z1, L"pre-start-audit-denial", 0, 0, false},
  {L"Z2", CaseId::z2, L"dirty-baseline-denial", 0, 0, false},
  {L"01", CaseId::normalTree, L"normal-tree", 1, 2, false},
  {L"02", CaseId::rootBeforeDescendants, L"root-before-descendants", 1, 2, false},
  {L"03", CaseId::invalidFixedExecutable, L"intentionally-absent-fixed-executable", 1, 0, false},
  {L"04", CaseId::controllerDeath, L"controller-death", 1, 2, false},
  {L"05", CaseId::controllerStall, L"controller-stall", 1, 2, false},
  {L"06", CaseId::absoluteDeadline, L"absolute-deadline", 1, 2, false},
  {L"07", CaseId::cancelHeld, L"held-cancel", 1, 0, false},
  {L"08", CaseId::cancelRunning, L"running-cancel", 1, 2, false},
  {L"09", CaseId::floodBothStreams, L"two-stream-output-flood", 1, 2, false},
  {L"10", CaseId::runningAuditFailure, L"running-audit-failure", 1, 2, false},
  {L"11", CaseId::directBreakaway, L"direct-breakaway-denial", 1, 2, false},
  {L"12", CaseId::targetedAddition, L"targeted-fixture-addition", 1, 2, false},
  {L"Z3", CaseId::z3, L"same-key-replay", 0, 0, false},
  {L"Z4", CaseId::z4, L"missing-terminal-recovery-copy", 0, 0, false},
  {L"13", CaseId::supervisorDeathLast, L"supervisor-death-LAST", 1, 2, true},
}};
constexpr unsigned rootCount() {
  unsigned n = 0;
  for (const auto& row : kMatrix) n += row.commandRootRequests;
  return n;
}
constexpr unsigned descendantCount() {
  unsigned n = 0;
  for (const auto& row : kMatrix) n += row.descendantRequestCeiling;
  return n;
}
constexpr unsigned zeroRootCount() {
  unsigned n = 0;
  for (const auto& row : kMatrix) if (!row.commandRootRequests) ++n;
  return n;
}
constexpr unsigned kObserverRequests = 1;
constexpr unsigned kControllerRequests = 13;
constexpr unsigned kSupervisorRequests = 13;
constexpr unsigned kRootRequestCeiling = 13;
constexpr unsigned kDescendantRequests = 22;
constexpr unsigned kTotalProofRequests = 62;
static_assert(kMatrix.size() == 17);
static_assert(rootCount() == kRootRequestCeiling);
static_assert(zeroRootCount() == 4);
static_assert(descendantCount() == kDescendantRequests);
static_assert(kObserverRequests + kControllerRequests + kSupervisorRequests +
              kRootRequestCeiling + kDescendantRequests == kTotalProofRequests);
static_assert(kMatrix.back().mustRunLast);

class ExactProcess final {
 public:
  ExactProcess() = default;
  ExactProcess(const ExactProcess&) = delete;
  ExactProcess& operator=(const ExactProcess&) = delete;
  ~ExactProcess() { close(); }
  void take(PROCESS_INFORMATION& result) {
    close();
    process_ = result.hProcess;
    thread_ = result.hThread;
    creationPidDiagnostic_ = result.dwProcessId; // never identify/kill by PID
    result.hProcess = nullptr;
    result.hThread = nullptr;
  }
  HANDLE process() const { return process_; }
  HANDLE primaryThread() const { return thread_; }
  bool valid() const { return process_ && thread_; }
  bool exited() const { return process_ && WaitForSingleObject(process_, 0) == WAIT_OBJECT_0; }
  bool creationTime(FILETIME& created) const {
    FILETIME exit{}, kernel{}, user{};
    return process_ && GetProcessTimes(process_, &created, &exit, &kernel, &user);
  }
  // Observer receives a reduced exact process handle, NEVER Job ownership.
  // Requires native handshake to bind the creator slot BEFORE this method.
  bool duplicateObservation(HANDLE observerProcess, HANDLE& observation) const {
    observation = nullptr;
    if (!process_ || !observerProcess) return false;
    return DuplicateHandle(GetCurrentProcess(), process_, observerProcess, &observation,
                           PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
                           FALSE, 0) != FALSE;
  }
 private:
  void close() {
    if (thread_) CloseHandle(thread_);
    if (process_) CloseHandle(process_);
    thread_ = nullptr;
    process_ = nullptr;
  }
  HANDLE process_ = nullptr;
  HANDLE thread_ = nullptr;
  DWORD creationPidDiagnostic_ = 0;
};

// Fixed manifest fields have no inherent authority. The bridge that could
// authenticate Owner consent is BLOCKED A1; this TU cannot construct it.
struct FrozenFixture {
  const CaseSpec* selectedCase = nullptr;
  Role role = Role::root;
  std::wstring absoluteProofExe;
  std::wstring absentExeForIntentionalCreateFailure;
  std::wstring canonicalFixtureWorkspace;
  std::vector<wchar_t> minimalUnicodeEnvironment;
  std::wstring fixedCommandLine;
  private_wire::Digest campaignDigest{}, invocationDigest{};
  private_wire::Epoch epoch{};
};
enum class FixtureAdmission { ownerBridgeMissing };
struct FixtureCustody {
  FixtureAdmission admission=FixtureAdmission::ownerBridgeMissing;
  ExactProcess* exactCreator=nullptr;
  HANDLE inheritedRegistrationPipe=nullptr; // borrowed from bootstrap
  HANDLE registeredJobObservation=nullptr; // borrowed for membership queries ONLY
  unsigned short nextFixedSlot=0;
  std::uint64_t nextGeneration=1;
  bool stopFenced=true; // no public setter to authorize a physical fixture
  bool eligible() const { return false; } // A1 unresolved; do not invent consent
};
struct HeldFixtureSlot {
  ExactProcess child;
  unsigned short id=0;
  std::uint64_t generation=0, offeredSequence=0;
  FILETIME created{};
  bool observerAck=false;
  bool resumeConsumed=false;
};


// Descendant creator owns original creation handles. Children must remain
// suspended until exact creator-origin handle registration is ACKed by the
// supervisor and observer; a reported PID NEVER suffices.
// S owns Job HANDLE; R/D never receive one. A registration pipe endpoint
// alone is NOT command authority. Creation is gated by BLOCKED A1 and cannot
// be invoked by either inert wmain.
class ExactInheritList {
 public:
  ExactInheritList() = default;
  ExactInheritList(const ExactInheritList&) = delete;
  ExactInheritList& operator=(const ExactInheritList&) = delete;
  ~ExactInheritList() { if (ready_) DeleteProcThreadAttributeList(list()); }
  bool prepare(HANDLE singleRegistrationEnd) {
    if (!singleRegistrationEnd) return false;
    SIZE_T bytes=0;
    InitializeProcThreadAttributeList(nullptr,1,0,&bytes);
    if (!bytes) return false;
    storage_.resize((bytes+sizeof(std::uintptr_t)-1)/sizeof(std::uintptr_t));
    if (!InitializeProcThreadAttributeList(list(),1,0,&bytes)) return false;
    ready_=true;
    inherited_=singleRegistrationEnd;
    return UpdateProcThreadAttribute(list(),0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                     &inherited_,sizeof(HANDLE),nullptr,nullptr)!=FALSE;
  }
  LPPROC_THREAD_ATTRIBUTE_LIST list() {
    return reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage_.data());
  }
 private:
  std::vector<std::uintptr_t> storage_;
  HANDLE inherited_=nullptr;
  bool ready_=false;
};
static std::mutex descendantCreationFence;
static bool createHeldDescendant(const FrozenFixture& manifest,FixtureCustody& custody,
                                HeldFixtureSlot& held) {
  std::lock_guard<std::mutex> lock(descendantCreationFence);
  if (!custody.eligible() || custody.stopFenced || !manifest.selectedCase ||
      !custody.exactCreator || !custody.exactCreator->valid() ||
      !custody.inheritedRegistrationPipe || held.child.valid() ||
      custody.nextFixedSlot>=manifest.selectedCase->descendantRequestCeiling ||
      manifest.absoluteProofExe.empty() || manifest.canonicalFixtureWorkspace.empty() ||
      manifest.fixedCommandLine.empty() ||
      manifest.minimalUnicodeEnvironment.size()<2 ||
      manifest.minimalUnicodeEnvironment.back()!=L'\0' ||
      manifest.minimalUnicodeEnvironment[manifest.minimalUnicodeEnvironment.size()-2]!=L'\0')
    return false;
  if (!SetHandleInformation(custody.inheritedRegistrationPipe,HANDLE_FLAG_INHERIT,
                            HANDLE_FLAG_INHERIT)) return false;
  ExactInheritList list;
  if (!list.prepare(custody.inheritedRegistrationPipe)) return false;
  std::vector<wchar_t> line(manifest.fixedCommandLine.begin(),manifest.fixedCommandLine.end());
  line.push_back(L'\0');
  STARTUPINFOEXW si{};
  si.StartupInfo.cb=sizeof(si);
  si.lpAttributeList=list.list();
  PROCESS_INFORMATION raw{};
  const bool testBreakaway=manifest.selectedCase->kind==CaseId::directBreakaway &&
                            custody.nextFixedSlot==0;
  DWORD flags=CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT |
              CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW;
  if (testBreakaway) flags |= CREATE_BREAKAWAY_FROM_JOB;
  // Each attempted descendant (including a denied breakaway) consumes one
  // fixed slot; no automatic retry. Durable recording is blocked by A1.
  const unsigned short consumed=custody.nextFixedSlot++;
  if (!CreateProcessW(manifest.absoluteProofExe.c_str(),line.data(),nullptr,
                      nullptr,TRUE,flags,
                      const_cast<wchar_t*>(manifest.minimalUnicodeEnvironment.data()),
                      manifest.canonicalFixtureWorkspace.c_str(),
                      &si.StartupInfo,&raw)) return false;
  held.child.take(raw);
  held.id=consumed;
  held.generation=custody.nextGeneration++;
  if (!held.child.creationTime(held.created)) {
    TerminateProcess(held.child.process(),1);
    return false;
  }
  if (testBreakaway) {
    // An unexpectedly created breakaway child is kept suspended and killed
    // through exact creator-retained HANDLE. It is NEVER counted as clean Job
    // custody; supervisor/observer must quarantine missing evidence.
    TerminateProcess(held.child.process(),1);
    WaitForSingleObject(held.child.process(),1000);
    return false;
  }
  return true; // STILL HELD; ACK and native release are separate.
}
// Handle values are fixture-private bytes, never public contracts or journal.
static bool encodeHeldOffer(const FrozenFixture& frozen,const HeldFixtureSlot& slot,
                            std::uint64_t sequence,std::vector<unsigned char>& bytes) {
  if (!slot.child.valid() || slot.generation==0 || sequence==0) return false;
  private_wire::Frame f{};
  f.kind=private_wire::Kind::registerHeld; f.sender=private_wire::Role::root;
  f.campaign=frozen.campaignDigest; f.invocation=frozen.invocationDigest;
  f.epoch=frozen.epoch; f.sequence=sequence; f.memberSlot=slot.id;
  if (!frozen.selectedCase) return false;
  f.caseNumber=static_cast<unsigned short>(frozen.selectedCase->kind);
  private_wire::put64(f.payload,static_cast<std::uint64_t>(
    reinterpret_cast<std::uintptr_t>(slot.child.process())));
  private_wire::put64(f.payload,static_cast<std::uint64_t>(
    reinterpret_cast<std::uintptr_t>(slot.child.primaryThread())));
  private_wire::put64(f.payload,slot.generation);
  private_wire::put64(f.payload,sequence);
  return private_wire::encode(f,bytes);
}
static bool observeHeldAck(HeldFixtureSlot& slot,const private_wire::Frame& ack,
                           std::uint64_t originalSequence) {
  if (!slot.child.valid() || slot.observerAck ||
      !private_wire::validateAck(ack,private_wire::Kind::observedAck,
                                 originalSequence,slot.generation)) return false;
  slot.observerAck=true;
  return true;
}
static bool releaseHeldFixtureOnce(const FixtureCustody& custody,HeldFixtureSlot& slot) {
  // No bridge means no release, even if a fixture crafted its own ACK.
  if (!custody.eligible() || custody.stopFenced ||
      !slot.observerAck || slot.resumeConsumed || !slot.child.valid())
    return false;
  slot.resumeConsumed=true;
  const DWORD prior=ResumeThread(slot.child.primaryThread());
  if (prior!=1) {
    TerminateProcess(slot.child.process(),1);
    return false;
  }
  return true;
}

static bool fixedAddition(std::int64_t left, std::int64_t right, std::int64_t& result) {
  if ((right > 0 && left > (std::numeric_limits<std::int64_t>::max)() - right) ||
      (right < 0 && left < (std::numeric_limits<std::int64_t>::min)() - right))
    return false;
  result = left + right;
  return true;
}
// Fixed non-secret numeric expected results, no inputs read from arbitrary
// command args, disk, stdout text or network. Native execution NOT authorised.
static bool targetedAdditionSelfCheck() {
  std::int64_t sum = 0;
  if (!fixedAddition(7, 5, sum) || sum != 12) return false;
  if (!fixedAddition(-9, 4, sum) || sum != -5) return false;
  if (fixedAddition((std::numeric_limits<std::int64_t>::max)(), 1, sum)) return false;
  if (fixedAddition((std::numeric_limits<std::int64_t>::min)(), -1, sum)) return false;
  return true;
}

// Future private role routing after accepted physical manifest (NOT INCLUDED):
// Observer: owns exact reduced process handles, never Job handle.
// Controller: only reviewed case; exclusive channel and finite heartbeats.
// Root: starts held descendants and sends creator-handle registration.
// Child/grandchild: wait held for verified ACK; no unmanaged broker launch.
// Targeted: fixed addition/overflow check only.
// Supervisor death LAST: observer can note known-member exit, but MUST NOT
// fabricate Job-zero, I/O joins, resource closure, or audit success.
// Z1/Z2/Z3/Z4: zero new root creations, no physical launch on replay.
// Unknown cleanup/audit/ownership: quarantined, NEVER new attempt or PASS.
} // namespace sud_d_private_fixture

int wmain(int /*argc*/, wchar_t** /*argv*/) {
  // Entry stays physically disabled in 2B-CODE. No CLI selector, environment
  // variable, imported model text, or bare signed binary can turn it on.
  return ERROR_ACCESS_DISABLED_BY_POLICY;
}
