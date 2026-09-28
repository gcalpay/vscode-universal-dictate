// Portable tests of the SAME transaction/policy used by the native helper.
#include "../../native/clipboard-transaction.h"
#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace universal_dictate::clipboard;

void check(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct FakeHost final : Host {
    bool claimed = false, opened = false, owner = false, violated = false;
    bool allowClaim = true, restoreOK = true, sendOK = true;
    int opens = 0, closes = 0, queries = 0, snapshots = 0, publishes = 0, restores = 0, sends = 0;
    int releases = 0;
    Code snapshotCode = Code::ok;
    Publish publishResult = Publish::ready;
    std::uint32_t serial = 42;
    std::string data = "original image / all formats", saved;
    std::vector<int> failOpen, failClose, zeroAtQuery;
    std::function<void(FakeHost&)> onSettle, onFirstClose, onPublish;
    bool contains(const std::vector<int>& values, int n) const noexcept {
        for (int value : values) if (value == n) return true;
        return false;
    }
    void needsOpen() noexcept { if (!opened) violated = true; }
    bool claim() noexcept override {
        if (claimed) violated = true;
        return claimed = allowClaim;
    }
    void releaseClaim() noexcept override {
        if (!claimed || opened) violated = true;
        claimed = false;
        ++releases;
    }
    bool open() noexcept override {
        if (opened || !claimed) violated = true;
        ++opens;
        if (contains(failOpen, opens)) return false;
        opened = true;
        return true;
    }
    bool close() noexcept override {
        needsOpen();
        ++closes;
        if (contains(failClose, closes)) return false;
        opened = false;
        if (closes == 1 && onFirstClose) onFirstClose(*this);
        return true;
    }
    std::uint32_t sequence() noexcept override {
        needsOpen();
        ++queries;
        return contains(zeroAtQuery, queries) ? 0 : serial;
    }
    bool isOwner() noexcept override { needsOpen(); return owner; }
    Code snapshot() noexcept override {
        needsOpen();
        ++snapshots;
        saved = data;
        return snapshotCode;
    }
    Publish publish() noexcept override {
        needsOpen();
        ++publishes;
        if (publishResult != Publish::unchangedFailure) {
            data = "transcript";
            owner = true;
            ++serial;
        }
        if (onPublish) onPublish(*this);
        return publishResult;
    }
    bool restore() noexcept override {
        needsOpen();
        if (!owner) violated = true;
        ++restores;
        if (restoreOK) data = saved;
        else data = "partial restore";
        ++serial;
        return restoreOK;
    }
    bool sendPaste() noexcept override {
        if (opened || !claimed) violated = true;
        ++sends;
        return sendOK;
    }
    void settlePaste() noexcept override {
        if (opened || !claimed) violated = true;
        if (onSettle) onSettle(*this);
    }
};

Result run(FakeHost& h) {
    Result r;
    {
        Transaction transaction(h);
        r = transaction.run();
    }
    check(!h.opened && !h.claimed && !h.violated, "lock lifetime violated");
    check(h.sends <= 1, "duplicate paste attempt");
    return r;
}

int main() {
    int passed = 0;
    auto test = [&](const char* name, auto body) {
        try { body(); ++passed; }
        catch (const std::exception& error) {
            std::cerr << "FAIL " << name << ": " << error.what() << '\n';
            throw;
        }
    };
    test("supported representations have typed duplication", [] {
        for (auto id : {1u, 4u, 5u, 6u, 7u, 8u, 11u, 12u, 13u, 15u, 16u, 17u, 0x81u})
            check(formatKind(id) == FormatKind::memory, "standard memory format");
        check(formatKind(2) == FormatKind::bitmap, "bitmap is not a raw buffer");
        check(formatKind(9) == FormatKind::palette, "palette is not a raw buffer");
        check(formatKind(3) == FormatKind::metafile, "nested metafile handles");
        check(formatKind(14) == FormatKind::enhancedMetafile, "enhanced metafile handles");
        check(formatKind(0x82) == FormatKind::bitmap && formatKind(0x83) == FormatKind::metafile &&
              formatKind(0x8e) == FormatKind::enhancedMetafile, "display forms");
    });
    test("known registered serializations accepted by name not dynamic id", [] {
        for (const auto* name : {L"HTML Format", L"Rich Text Format", L"PNG", L"Biff8", L"Preferred DropEffect",
                                L"ExcludeClipboardContentFromMonitorProcessing", L"Shell IDList Array"})
            check(formatKind(0xc123, name) == FormatKind::memory, "registered data");
        check(formatKind(0xffff, L"html format") == FormatKind::memory, "case insensitive format name");
        check(formatKind(0xbfff, L"HTML Format") == FormatKind::unsupported, "private id not promoted");
    });
    test("unknown or source-dependent formats are refused", [] {
        for (auto id : {0u, 10u, 0x80u, 0x200u, 0x2ffu, 0x300u, 0x3ffu, 0xc001u, 0x10000u})
            check(formatKind(id) == FormatKind::unsupported, "unknown id must not be raw copied");
        for (const auto* name : {L"DataObject", L"Ole Private Data", L"FileContents", L"SomeAppPointer", L"HTML Format suffix"})
            check(formatKind(0xc123, name) == FormatKind::unsupported, "owner-dependent name");
    });
    test("ordinary multi-format clipboard restored", [] {
        FakeHost h; const auto r = run(h);
        check(r.code == Code::ok && r.paste == Paste::submitted && r.clipboard == Clipboard::restored, "result");
        check(h.data == "original image / all formats" && h.sends == 1 && h.restores == 1, "round trip");
    });
    test("originally empty clipboard restored empty", [] {
        FakeHost h; h.data.clear(); const auto r = run(h);
        check(h.data.empty() && r.clipboard == Clipboard::restored, "empty not converted to text");
    });
    test("newer text preserved", [] {
        FakeHost h; h.onSettle = [](auto& f) { f.owner = false; ++f.serial; f.data = "new copy"; };
        const auto r = run(h);
        check(r.code == Code::ok && r.clipboard == Clipboard::newer && h.restores == 0 && h.data == "new copy", "new copy lost");
    });
    test("identical newer text still belongs to later copy", [] {
        FakeHost h; h.onSettle = [](auto& f) { f.owner = false; ++f.serial; f.data = "transcript"; };
        const auto r = run(h);
        check(r.clipboard == Clipboard::newer && h.restores == 0 && h.data == "transcript", "string equality used");
    });
    test("newer image preserved", [] {
        FakeHost h; h.onSettle = [](auto& f) { f.owner = false; ++f.serial; f.data = "new image formats"; };
        const auto r = run(h);
        check(r.clipboard == Clipboard::newer && h.data == "new image formats" && h.restores == 0, "image lost");
    });
    test("sequence change with unchanged owner still refuses restoration", [] {
        FakeHost h; h.onSettle = [](auto& f) { ++f.serial; f.data = "new format added"; };
        check(run(h).clipboard == Clipboard::newer && h.restores == 0, "owner-only check");
    });
    test("owner change with identical sequence refuses restoration", [] {
        FakeHost h; h.onSettle = [](auto& f) { f.owner = false; };
        check(run(h).clipboard == Clipboard::newer && h.restores == 0, "sequence-only check");
    });
    test("copy before dispatch cancels paste altogether", [] {
        FakeHost h; h.onFirstClose = [](auto& f) { ++f.serial; f.owner = false; f.data = "overtook"; };
        const auto r = run(h);
        check(r.code == Code::clipboardChanged && r.paste == Paste::notAttempted && h.sends == 0 && h.restores == 0, "unsafe dispatch");
    });
    test("nonblocking global transaction claim", [] {
        FakeHost h; h.allowClaim = false;
        check(run(h).code == Code::busy && h.opens == 0 && h.sends == 0 && h.releases == 0, "busy transaction touched clipboard");
    });
    test("initial clipboard contention performs no mutation", [] {
        FakeHost h; h.failOpen = {1};
        check(run(h).code == Code::clipboardBusy && h.publishes == 0, "contention mutated clipboard");
    });
    test("snapshot unsupported aborts before first write", [] {
        FakeHost h; h.snapshotCode = Code::snapshotUnsupported;
        check(run(h).code == Code::snapshotUnsupported && h.publishes == 0 && h.sends == 0, "unsupported format discarded");
    });
    test("snapshot failure aborts before first write", [] {
        FakeHost h; h.snapshotCode = Code::snapshotFailed;
        check(run(h).code == Code::snapshotFailed && h.publishes == 0 && h.restores == 0, "snapshot failure mutation");
    });
    test("initial sequence query failure aborts", [] {
        FakeHost h; h.zeroAtQuery = {1};
        check(run(h).code == Code::ownershipUnknown && h.snapshots == 0 && h.publishes == 0, "unknown clipboard altered");
    });
    test("EmptyClipboard failure leaves original in place", [] {
        FakeHost h; h.publishResult = Publish::unchangedFailure;
        const auto r = run(h);
        check(r.code == Code::writeFailed && r.clipboard == Clipboard::unchanged && h.restores == 0 && h.sends == 0, "unnecessary restore");
    });
    test("partial temporary write rolls back before unlocking", [] {
        FakeHost h; h.publishResult = Publish::changedFailure;
        const auto r = run(h);
        check(r.code == Code::writeFailed && r.clipboard == Clipboard::restored && h.restores == 1 && h.sends == 0, "failed write rollback");
    });
    test("failed rollback reported partial", [] {
        FakeHost h; h.publishResult = Publish::changedFailure; h.restoreOK = false;
        const auto r = run(h);
        check(r.code == Code::restoreFailed && r.clipboard == Clipboard::partial && h.sends == 0, "partial restore hidden");
    });
    test("zero sequence after write rolls back while initial lock held", [] {
        FakeHost h; h.zeroAtQuery = {2};
        const auto r = run(h);
        check(r.code == Code::ownershipUnknown && r.clipboard == Clipboard::restored && h.restores == 1 && h.sends == 0, "zero sequence rollback");
    });
    test("unexpected ownership after write never guessed", [] {
        FakeHost h; h.onPublish = [](auto& f) { f.owner = false; };
        const auto r = run(h);
        check(r.code == Code::ownershipUnknown && r.clipboard == Clipboard::unknown && h.restores == 0, "guessed owner");
    });
    test("query failure immediately before paste skips both write and paste", [] {
        FakeHost h; h.zeroAtQuery = {3};
        const auto r = run(h);
        check(r.code == Code::ownershipUnknown && r.clipboard == Clipboard::unknown && h.sends == 0 && h.restores == 0, "unsafe dispatch on unknown");
    });
    test("query failure after paste never blindly restores", [] {
        FakeHost h; h.zeroAtQuery = {4};
        const auto r = run(h);
        check(r.code == Code::ownershipUnknown && r.paste == Paste::submitted && r.clipboard == Clipboard::unknown && h.restores == 0, "blind restore");
    });
    test("input failure may have partially pasted; never retry", [] {
        FakeHost h; h.sendOK = false;
        const auto r = run(h);
        check(r.code == Code::pasteFailed && r.paste == Paste::uncertain && r.clipboard == Clipboard::restored && h.sends == 1, "retry or false success");
    });
    test("input failure followed by newer copy preserves newer", [] {
        FakeHost h; h.sendOK = false;
        h.onSettle = [](auto& f) { ++f.serial; f.owner = false; f.data = "keep newer"; };
        const auto r = run(h);
        check(r.code == Code::pasteFailed && r.clipboard == Clipboard::newer && h.restores == 0, "failed paste destroyed newer");
    });
    test("post-paste restoration failure reported partial", [] {
        FakeHost h; h.restoreOK = false;
        const auto r = run(h);
        check(r.code == Code::restoreFailed && r.paste == Paste::submitted && r.clipboard == Clipboard::partial && h.sends == 1, "false restore success");
    });
    test("post-paste clipboard contention reports unknown", [] {
        FakeHost h; h.failOpen = {3};
        const auto r = run(h);
        check(r.code == Code::restoreFailed && r.clipboard == Clipboard::unknown && h.restores == 0, "blind restore without lock");
    });
    test("dispatch contention restores instead of eventually pasting", [] {
        FakeHost h; h.failOpen = {2};
        const auto r = run(h);
        check(r.code == Code::clipboardBusy && r.clipboard == Clipboard::restored && h.sends == 0, "queued paste");
    });
    test("dispatch and recovery contention leaves explicitly unknown state", [] {
        FakeHost h; h.failOpen = {2, 3};
        const auto r = run(h);
        check(r.code == Code::restoreFailed && r.clipboard == Clipboard::unknown && h.sends == 0, "unknown not surfaced");
    });
    test("close failure before first unlock rolls back", [] {
        FakeHost h; h.failClose = {1};
        const auto r = run(h);
        check(r.code == Code::clipboardBusy && r.clipboard == Clipboard::restored && h.sends == 0, "close failure paste");
    });
    test("dispatch close failure rolls back", [] {
        FakeHost h; h.failClose = {2};
        const auto r = run(h);
        check(r.code == Code::clipboardBusy && r.clipboard == Clipboard::restored && h.sends == 0, "dispatch close paste");
    });
    test("final close failure is not a successful transaction", [] {
        FakeHost h; h.failClose = {3};
        const auto r = run(h);
        check(r.code == Code::clipboardBusy && r.clipboard == Clipboard::restored && h.sends == 1, "close failure false success");
    });
    test("one transaction cannot be reused", [] {
        FakeHost h;
        { Transaction tx(h); check(tx.run().code == Code::ok, "initial call");
          check(tx.run().code == Code::invalidRequest && h.sends == 1, "second paste attempted"); }
        check(!h.claimed && !h.opened && !h.violated, "release");
    });
    test("result code names match protocol tokens", [] {
        check(std::string(codeName(Code::snapshotUnsupported)) == "snapshot_unsupported", "code name");
        check(std::string(pasteName(Paste::notAttempted)) == "not_attempted", "paste name");
        check(std::string(clipboardName(Clipboard::partial)) == "partial", "clipboard name");
    });
    std::cout << passed << " clipboard transaction/policy tests passed\n";
}
