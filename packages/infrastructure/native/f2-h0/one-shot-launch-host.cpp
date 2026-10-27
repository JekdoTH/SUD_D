// SUD-D F2-H0 — fixed Windows one-shot launch host SOURCE CANDIDATE.
// NOT PRODUCTION WIRED / NOT EXECUTED / NO NATIVE PROOF.
// Future build is Windows x64, non-elevated. NO argv, cwd, env, executable,
// handle-role or path selectors in the admitted request. No shell, service,
// network, thread pool, dynamic plugins, or generic process-creation endpoint.
//
// The authenticated input/output control capabilities are the exact private
// pipe handles inherited from the trusted Desktop-owned Runner STARTUPINFOEX handle list.
// Their OS origin/ownership and the launcher binary hash MUST be established
// in the Runner/Desktop creation chain by H1; an epoch string is NOT authentication.
// The separate bootstrap frame contains only Gateway-created, fixed-role
// OS handles (Runner process + temporary non-inherited worker Job).
//
// Runtime kernel-held stage/peer gate is checked before ANY native mutation.
// Without a trusted independently checked Gateway lease this returns false.
// Compiled code is NOT H1 proof or authorization.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <userenv.h>
#include <wincrypt.h>
#include <aclapi.h>
#include <cwctype>
#include <cstdint>
#include <cwchar>
#include <cstring>
#include <array>
#include <iterator>
#include <vector>
#include <string>
#pragma comment(lib, "userenv.lib")

namespace f2h0 {
constexpr DWORD kMagic = 0x30483246; // "F2H0" little-endian
constexpr DWORD kVersion = 2; // Topology B breaks historical Gateway-owned v1 ABI
// No constexpr proof flag: native CreateProcessW and cleanup must remain linked.
// Runtime prerequisite checks real OS handles; no environment/config toggles.
constexpr wchar_t kProfile[] = L"SUD_D_F2B2_20261008_01";
constexpr wchar_t kOwnPinnedLocation[] =
    L"C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2-h1-topology-b-candidate-20261008\\sud-d-f2-h0.exe";
constexpr char kRuntimeSha256[] =
    "63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088";
constexpr wchar_t kRuntime[] = L"C:\\Program Files\\nodejs\\node.exe";
constexpr wchar_t kStageRoot[] =
    L"C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2b2-native-proof\\f2b2-20261008-01\\stage";
constexpr wchar_t kEntry[] =
    L"C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2b2-native-proof\\f2b2-20261008-01\\stage\\fixture.mjs";
constexpr char kStageFingerprint[] =
    "6bea035e9ad7f90b9039d23ef3d6a6665b6c0100647929185443025727b32180";
constexpr char kRecipeFingerprint[] =
    "e5c41818190a1fad386111d796c4b1a65b36de58ce60de5455094ce41810afd8";
constexpr DWORD kFlags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT
    | EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW;
constexpr DWORD kProcessTransferRights =
    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | SYNCHRONIZE;
constexpr DWORD kThreadTransferRights =
    THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION | SYNCHRONIZE;

// Avoid compiler-specific alignment and variable-length protocol frames.
// Host is 64-bit only; both sides must review/freeze the exact wire layout.
#pragma pack(push, 1)
struct FixedRequest {
    DWORD magic;
    DWORD version;
    WCHAR missionId[64];
    DWORD missionRevision;
    WCHAR attemptId[64];
    WCHAR workspaceId[64];
    WCHAR workspaceGeneration[64];
    WCHAR ownerEpoch[64];
    char stageFingerprint[65];
    char recipeFingerprint[65];
    BYTE challenge[32];
};
struct TrustedBootstrap {
    DWORD magic;
    DWORD version;
    WCHAR ownerEpoch[64];
    BYTE challenge[32];
    uint64_t runnerProcessLocalHandle; // exact Runner PROCESS, NEVER mission input
    uint64_t temporaryJobLocalHandle;    // Worker Job temporary duplicate, not guardian
    uint64_t heldEntryLocalHandle;       // Desktop sealed stage lease, not caller input
    uint64_t expectedStageVolume;       // Gateway verified identity, not child output
    BYTE expectedStageId[16];           // stage FileIdInfo, exact held object
    DWORD expectedProfileSidLength;      // SID length from Desktop-reviewed stage seal
    BYTE expectedProfileSid[SECURITY_MAX_SID_SIZE]; // exact OS-issued SID, not a name label
};
struct TransferReceipt {
    DWORD magic;
    DWORD version;
    uint64_t gatewayLocalProcessHandle;
    uint64_t gatewayLocalThreadHandle;
};
#pragma pack(pop)

bool isValid(HANDLE h) {
    return h && h != INVALID_HANDLE_VALUE && h != GetCurrentProcess()
        && h != GetCurrentThread();
}
bool checkInherit(HANDLE h, bool expected) {
    if (!isValid(h)) return false;
    DWORD flags = 0;
    if (!GetHandleInformation(h, &flags)) return false;
    return ((flags & HANDLE_FLAG_INHERIT) != 0) == expected;
}
bool pipe(HANDLE h) { return isValid(h) && GetFileType(h) == FILE_TYPE_PIPE; }
// SHA-256 pinned runtime bytes. A read-only file hash is NOT held-file
// CreateProcessW identity/TOCTOU proof: H1 must provide that separately.
bool pinnedRuntimeBytes() {
    HANDLE source = CreateFileW(kRuntime, GENERIC_READ, FILE_SHARE_READ,
                    nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (!isValid(source)) return false;
    FILE_ATTRIBUTE_TAG_INFO tag{};
    bool ok = GetFileInformationByHandleEx(source, FileAttributeTagInfo,
                   &tag, sizeof(tag)) && !(tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT);
    HCRYPTPROV provider = 0;
    HCRYPTHASH digest = 0;
    if (ok) ok = CryptAcquireContextW(&provider, nullptr, nullptr,
                                   PROV_RSA_AES, CRYPT_VERIFYCONTEXT) == TRUE;
    if (ok) ok = CryptCreateHash(provider, CALG_SHA_256, 0, 0, &digest) == TRUE;
    std::array<BYTE, 65536> block{};
    while (ok) {
        DWORD length = 0;
        if (!ReadFile(source, block.data(), static_cast<DWORD>(block.size()),
                      &length, nullptr)) { ok = false; break; }
        if (!length) break;
        if (!CryptHashData(digest, block.data(), length, 0)) ok = false;
    }
    BYTE bytes[32]{};
    DWORD count = sizeof(bytes);
    if (ok) ok = CryptGetHashParam(digest, HP_HASHVAL, bytes, &count, 0)
                   && count == sizeof(bytes);
    static constexpr char alphabet[] = "0123456789abcdef";
    if (ok) for (size_t i = 0; i < sizeof(bytes); ++i) {
        if (alphabet[(bytes[i] >> 4) & 0xf] != kRuntimeSha256[2*i]
            || alphabet[bytes[i] & 0xf] != kRuntimeSha256[2*i+1]) { ok = false; break; }
    }
    if (digest) CryptDestroyHash(digest);
    if (provider) CryptReleaseContext(provider, 0);
    CloseHandle(source);
    return ok;
}
bool readExact(HANDLE h, void* dest, DWORD count) {
    BYTE* bytes = static_cast<BYTE*>(dest);
    while (count) {
        DWORD got = 0;
        if (!ReadFile(h, bytes, count, &got, nullptr) || !got) return false;
        count -= got;
        bytes += got;
    }
    return true;
}
bool writeExact(HANDLE h, const void* src, DWORD count) {
    const BYTE* bytes = static_cast<const BYTE*>(src);
    while (count) {
        DWORD written = 0;
        if (!WriteFile(h, bytes, count, &written, nullptr) || !written) return false;
        count -= written;
        bytes += written;
    }
    return true;
}
bool validToken(const WCHAR (&s)[64]) {
    bool ended = false;
    size_t length = 0;
    for (const WCHAR c : s) {
        if (c == 0) { ended = true; continue; }
        if (ended) return false; // no hidden suffix payload
        const bool good = (c >= L'a' && c <= L'z')
            || (c >= L'A' && c <= L'Z') || (c >= L'0' && c <= L'9')
            || c == L'-' || c == L'_';
        if (!good) return false;
        ++length;
    }
    return length > 0 && length <= 63 && ended;
}
bool validDigest(const char (&candidate)[65], const char* pinned) {
    return candidate[64] == '\0' && std::memcmp(candidate, pinned, 64) == 0;
}
bool validate(const FixedRequest& r, const TrustedBootstrap& b) {
    return r.magic == kMagic && r.version == kVersion
        && b.magic == kMagic && b.version == kVersion
        && r.missionRevision >= 1
        && validToken(r.missionId) && validToken(r.attemptId)
        && validToken(r.workspaceId) && validToken(r.workspaceGeneration)
        && validToken(r.ownerEpoch) && validToken(b.ownerEpoch)
        && std::memcmp(r.ownerEpoch, b.ownerEpoch, sizeof(r.ownerEpoch)) == 0
        && std::memcmp(r.challenge, b.challenge, sizeof(r.challenge)) == 0
        && validDigest(r.stageFingerprint, kStageFingerprint)
        && validDigest(r.recipeFingerprint, kRecipeFingerprint);
}

/**
 * OS-backed pre-creation gate, not a generic caller-supplied attestation.
 * The H0 peer must duplicate a NONINHERITABLE read-only stage handle INTO
 * this exact one-shot host and independently freeze the FileId/volume/ACL
 * and dependency closure while the process is suspended. The host retains
 * the stage handle through CreateProcessW and checks its local identity.
 * This alone is not the missing independent Desktop/Gateway/watchdog proof.
 */
bool trustedHeldStageAndRunnerAuthority(const TrustedBootstrap& b,
                                         const FixedRequest& r) {
    HANDLE bootstrapRunner = reinterpret_cast<HANDLE>(
        static_cast<uintptr_t>(b.runnerProcessLocalHandle));
    HANDLE entry = reinterpret_cast<HANDLE>(
        static_cast<uintptr_t>(b.heldEntryLocalHandle));
    if (!validate(r,b) || !checkInherit(bootstrapRunner,false)
        || !checkInherit(entry,false) || entry == bootstrapRunner
        || b.expectedStageVolume == 0
        || WaitForSingleObject(bootstrapRunner,0) != WAIT_TIMEOUT)
        return false;
    const DWORD runnerPid = GetProcessId(bootstrapRunner);
    if (runnerPid == 0 || runnerPid == GetCurrentProcessId())
        return false;
    FILE_ID_INFO fileId{};
    FILE_STANDARD_INFO stat{};
    FILE_ATTRIBUTE_TAG_INFO attributes{};
    if (!GetFileInformationByHandleEx(entry, FileIdInfo, &fileId, sizeof(fileId))
        || !GetFileInformationByHandleEx(entry, FileStandardInfo, &stat, sizeof(stat))
        || !GetFileInformationByHandleEx(entry, FileAttributeTagInfo,
                                         &attributes, sizeof(attributes))
        || fileId.VolumeSerialNumber != b.expectedStageVolume
        || std::memcmp(fileId.FileId.Identifier,b.expectedStageId,16) != 0
        || stat.NumberOfLinks != 1 || stat.DeletePending
        || (attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT))
        return false;

    wchar_t fullPath[32768]{};
    const DWORD n = GetFinalPathNameByHandleW(
        entry,fullPath,static_cast<DWORD>(std::size(fullPath)),FILE_NAME_NORMALIZED);
    constexpr wchar_t kExpectedPrefix[] = L"\\\\?\\";
    if (!n || n >= std::size(fullPath) ||
        wcsncmp(fullPath,kExpectedPrefix,4) != 0 ||
        _wcsicmp(fullPath+4,kEntry) != 0) return false;

    // Owner + DACL must be kernel-backed, protected and non-null.
    // A full ACE policy comparison, ancestors and dependencies must also be
    // performed by the trusted Gateway-held attestor before OS permission.
    PSID owner = nullptr;
    PACL dacl = nullptr;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    const DWORD secError = GetSecurityInfo(entry,SE_FILE_OBJECT,
        OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
        &owner,nullptr,&dacl,nullptr,&descriptor);
    if (secError != ERROR_SUCCESS || !owner || !IsValidSid(owner)
        || !dacl || !IsValidAcl(dacl) || !descriptor) {
        if (descriptor) LocalFree(descriptor);
        return false;
    }
    SECURITY_DESCRIPTOR_CONTROL controls{};
    DWORD revision = 0;
    const bool protectedAcl = GetSecurityDescriptorControl(
        descriptor,&controls,&revision) != FALSE
        && (controls & SE_DACL_PROTECTED) != 0;
    LocalFree(descriptor);
    if (!protectedAcl) return false;

    // Do not accept epoch text, nonce, a numeric PID or this local FileId
    // check by themselves as an H1 permit. The caller still MUST supply
    // independent trusted Gateway stage/peer/watchdog proof before creation;
    // no such authorized broker is registered in this revision.
    return protectedAcl;
}

struct Owned {
    HANDLE in = nullptr;
    HANDLE out = nullptr;
    HANDLE proc = nullptr;
    HANDLE thread = nullptr;
    HANDLE job = nullptr; // Gateway-owned Job DUPLICATE, never owner authority
    HANDLE runner = nullptr;
    PSID sid = nullptr;
    bool assigned = false;
    bool terminated = false;
    bool transferred = false;
    ~Owned() {
        bool confirmedEmpty = (proc == nullptr);
        if (proc && !terminated) {
            // On partial creation or transfer errors: terminate the known
            // owned Job; never let launcher exit leaving a live suspended
            // worker from an unknown transfer.
            if (assigned && job) TerminateJobObject(job, 0xef);
            else TerminateProcess(proc, 0xef);
            if (WaitForSingleObject(proc, 5000) == WAIT_OBJECT_0) {
                if (assigned && job) {
                    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
                    DWORD got = 0;
                    confirmedEmpty = QueryInformationJobObject(
                        job, JobObjectBasicAccountingInformation,
                        &accounting, sizeof(accounting), &got)
                        && accounting.ActiveProcesses == 0;
                } else confirmedEmpty = true;
                terminated = confirmedEmpty;
            }
        }
        if (thread) CloseHandle(thread);
        if (proc) CloseHandle(proc);
        if (in) CloseHandle(in);
        if (out) CloseHandle(out);
        if (job) CloseHandle(job);
        // Runner PROCESS HANDLE is a temporary noninheritable duplicate.
        if (runner) CloseHandle(runner);
        if (sid) FreeSid(sid);
        // Unknown tree cleanup requires the Gateway watcher to quarantine;
        // exit status alone can NEVER prove complete descendant cleanup.
    }
};

bool launchFixed(const TrustedBootstrap& bootstrap, HANDLE output) {
    Owned owner;
    owner.runner = reinterpret_cast<HANDLE>(
        static_cast<uintptr_t>(bootstrap.runnerProcessLocalHandle));
    owner.job = reinterpret_cast<HANDLE>(
        static_cast<uintptr_t>(bootstrap.temporaryJobLocalHandle));
    if (owner.runner == owner.job || !checkInherit(owner.runner, false)
        || !checkInherit(owner.job, false)
        || WaitForSingleObject(owner.runner, 0) != WAIT_TIMEOUT) return false;

    JOBOBJECT_EXTENDED_LIMIT_INFORMATION lim{};
    DWORD returned = 0;
    if (!QueryInformationJobObject(owner.job, JobObjectExtendedLimitInformation,
                                   &lim, sizeof(lim), &returned)
        || returned != sizeof(lim)
        || lim.BasicLimitInformation.ActiveProcessLimit != 8
        || lim.JobMemoryLimit != 512ull*1024*1024
        || (lim.BasicLimitInformation.LimitFlags &
            (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
             JOB_OBJECT_LIMIT_JOB_MEMORY | JOB_OBJECT_LIMIT_JOB_TIME))
            != (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
                JOB_OBJECT_LIMIT_JOB_MEMORY | JOB_OBJECT_LIMIT_JOB_TIME)
        || (lim.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_BREAKAWAY_OK))
        return false;

    // Desktop solely provisions/cleans the owned profile. Derivation is
    // read-only and CANNOT independently prove the profile exists or that
    // its ACL was sealed: Desktop evidence is required before H0 is resumed.
    PSID sid = nullptr;
    if (bootstrap.expectedProfileSidLength < 8 ||
        bootstrap.expectedProfileSidLength > SECURITY_MAX_SID_SIZE ||
        DeriveAppContainerSidFromAppContainerName(kProfile, &sid) != S_OK ||
        !sid || !IsValidSid(sid)) {
        if (sid) FreeSid(sid);
        return false;
    }
    owner.sid = sid;
    if (GetLengthSid(sid) != bootstrap.expectedProfileSidLength ||
        !IsValidSid(const_cast<BYTE*>(bootstrap.expectedProfileSid)) ||
        !EqualSid(sid, const_cast<BYTE*>(bootstrap.expectedProfileSid)))
        return false;

    SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    owner.in = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                           &sa, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    owner.out = CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
                            &sa, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (!checkInherit(owner.in, true) || !checkInherit(owner.out, true)
        || owner.in == owner.out || owner.in == owner.runner
        || owner.out == owner.runner || owner.in == owner.job
        || owner.out == owner.job) return false;

    // Bounded STARTUPINFOEX attribute list/data must remain allocated until
    // DeleteProcThreadAttributeList, including failed CreateProcessW.
    SIZE_T needed = 0;
    InitializeProcThreadAttributeList(nullptr, 2, 0, &needed);
    if (needed < 32 || needed > 65536) return false;
    std::vector<BYTE> storage(needed, 0);
    auto* attrs = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
    if (!InitializeProcThreadAttributeList(attrs, 2, 0, &needed)) return false;
    SECURITY_CAPABILITIES security{sid, nullptr, 0, 0};
    HANDLE allowlist[2]{owner.in, owner.out};
    const bool updated = UpdateProcThreadAttribute(
        attrs, 0, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
        &security, sizeof(security), nullptr, nullptr)
        && UpdateProcThreadAttribute(attrs, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                     allowlist, sizeof(allowlist), nullptr, nullptr);
    if (!updated) { DeleteProcThreadAttributeList(attrs); return false; }

    STARTUPINFOEXW start{};
    start.StartupInfo.cb = sizeof(start);
    start.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    start.StartupInfo.hStdInput = owner.in;
    start.StartupInfo.hStdOutput = owner.out;
    start.StartupInfo.hStdError = owner.out; // reviewed exact alias
    start.lpAttributeList = attrs;
    std::wstring command = std::wstring(L"\"") + kRuntime + L"\" \"" + kEntry + L"\" positive";
    // Exact user-owned scratch locations, no PATH, credential or profile env.
    wchar_t env[] = L"SystemRoot=C:\\Windows\0TEMP=C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2b2-native-proof\\f2b2-20261008-01\\scratch\0TMP=C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2b2-native-proof\\f2b2-20261008-01\\scratch\0\0";
    PROCESS_INFORMATION p{};
    const BOOL created = CreateProcessW(kRuntime, command.data(), nullptr, nullptr,
        TRUE, kFlags, env, kStageRoot, &start.StartupInfo, &p);
    DeleteProcThreadAttributeList(attrs);
    if (!created) return false;
    owner.proc = p.hProcess;
    owner.thread = p.hThread;
    if (!AssignProcessToJobObject(owner.job, owner.proc)) return false;
    owner.assigned = true;
    BOOL member = FALSE;
    if (!IsProcessInJob(owner.proc, owner.job, &member) || !member) return false;

    // NOTE: These are rights-reduced non-inheritable duplicates into the
    // ALREADY-OPEN trusted Gateway PROCESS object, not a PID lookup.
    HANDLE transferredProcess = nullptr, transferredThread = nullptr;
    if (!DuplicateHandle(GetCurrentProcess(), owner.proc, owner.runner,
                         &transferredProcess, kProcessTransferRights, FALSE, 0))
        return false;
    if (!DuplicateHandle(GetCurrentProcess(), owner.thread, owner.runner,
                         &transferredThread, kThreadTransferRights, FALSE, 0)) {
        // Close already-exported Gateway handle without PID adoption.
        DuplicateHandle(owner.runner, transferredProcess, nullptr, nullptr,
                        0, FALSE, DUPLICATE_CLOSE_SOURCE);
        return false;
    }

    // H0 verifies creation/transfer ordering; H1 Gateway must independently
    // inspect the transferred handles, held stage + token/Job before resume.
    const TransferReceipt receipt{
        kMagic, kVersion,
        static_cast<uint64_t>(reinterpret_cast<uintptr_t>(transferredProcess)),
        static_cast<uint64_t>(reinterpret_cast<uintptr_t>(transferredThread)),
    };
    if (!writeExact(output, &receipt, sizeof(receipt))) {
        DuplicateHandle(owner.runner, transferredProcess, nullptr, nullptr,
                        0, FALSE, DUPLICATE_CLOSE_SOURCE);
        DuplicateHandle(owner.runner, transferredThread, nullptr, nullptr,
                        0, FALSE, DUPLICATE_CLOSE_SOURCE);
        return false;
    }

    // DO NOT resume worker. Close all H0 temporary PROCESS/THREAD/Job handles.
    if (!CloseHandle(owner.thread)) return false;
    owner.thread = nullptr;
    if (!CloseHandle(owner.proc)) return false;
    owner.proc = nullptr;
    if (!CloseHandle(owner.job)) return false;
    owner.job = nullptr;
    owner.terminated = true; // suspended worker owner transferred to Runner
    owner.transferred = true; // Runner owns worker Job; Desktop owns profile cleanup
    // Exiting closes remaining inherited control handles. Gateway must wait
    // on its exact H0 PROCESS HANDLE and query the Job before any resume.
    return true;
}
} // namespace f2h0

int wmain(int argc, wchar_t**) {
    using namespace f2h0;
    if (argc != 1) return 40; // NO commandline or caller selectors.
    wchar_t ownPath[32768]{};
    DWORD n = GetModuleFileNameW(nullptr, ownPath,
                                static_cast<DWORD>(std::size(ownPath)));
    if (!n || n >= std::size(ownPath)
        || _wcsicmp(ownPath, kOwnPinnedLocation) != 0) return 40;
    HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
    if (!pipe(input) || !pipe(output) || input == output) return 41;
    // Gateway MUST create exactly these anonymous pipes with a private
    // STARTUPINFOEX allowlist. Revoke inheritance before worker launch.
    if (!SetHandleInformation(input, HANDLE_FLAG_INHERIT, 0)
        || !SetHandleInformation(output, HANDLE_FLAG_INHERIT, 0)
        || !checkInherit(input, false) || !checkInherit(output, false)) return 42;

    FixedRequest request{};
    TrustedBootstrap bootstrap{};
    if (!readExact(input, &request, sizeof(request))
        || !readExact(input, &bootstrap, sizeof(bootstrap))
        || !validate(request, bootstrap)) return 43;

    // Missing Win32 held-stage ACL/FileID/TOCTOU attestor and H1 acceptance.
    // This line is intentionally reached BEFORE any worker OS creation,
    // CreateFileW(NUL), native Job assignment or CreateProcessW.
    if (!trustedHeldStageAndRunnerAuthority(bootstrap, request)) return 44;
    if (!pinnedRuntimeBytes()) return 44;
    return launchFixed(bootstrap, output) ? 0 : 45;
}
