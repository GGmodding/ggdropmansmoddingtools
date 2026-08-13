-- GGDropman Grounded 2 Cheat Menu (UE4SS Lua)
-- Hotkeys always work. F8 toggles an in-game help popup attached to the
-- live UI_HUD (same pattern as BackpackScrollBox). We do NOT construct a
-- standalone UserWidget -- that crashes Grounded 2.

local Cheats = require("cheats")

print("[GGDropmanCheatMenu] loading...\n")

local Visibility_VISIBLE = 0
local Visibility_COLLAPSED = 1
local Visibility_HIDDEN = 2
local Visibility_SELFHITTESTINVISIBLE = 4

local dupQty = 1
local popupRoot = nil
local popupText = nil
local popupVisible = false
local popupHideToken = 0
local POPUP_SECONDS = 12

local function helpLines()
    return {
        "GGDropman G2 Cheats",
        "F8   toggle this popup",
        "F6   Fill vitals",
        "F7   Toggle God Mode",
        "F9   Duplicate held x qty",
        "PGUP Cycle dup qty (1/5/10/25)",
        "F11  Fill bag stacks to 999",
        "F12  Probe pawn/inv/lib",
        string.format("Dup qty: %d | God: %s", dupQty, Cheats._godEnabled and "ON" or "OFF"),
        tostring(Cheats.LAST_STATUS or ""),
    }
end

local function buildHelpText()
    return table.concat(helpLines(), "\n")
end

local function printHelpConsole()
    print("========== GGDropman G2 Cheat Menu ==========\n")
    for _, line in ipairs(helpLines()) do
        print(line .. "\n")
    end
    print("=============================================\n")
end

local function FLinearColor(R, G, B, A)
    return { R = R, G = G, B = B, A = A }
end

local function FSlateColor(R, G, B, A)
    return { SpecifiedColor = FLinearColor(R, G, B, A), ColorUseRule = 0 }
end

local function setPopupText(text)
    if popupText == nil or not popupText:IsValid() then return end
    -- Prefer plain string; FText can be flaky on some UE5.6 builds.
    local ok = pcall(function() popupText:SetText(text) end)
    if not ok then
        pcall(function()
            if type(FText) == "function" then
                popupText:SetText(FText(text))
            end
        end)
    end
end

local function destroyPopup()
    if popupRoot ~= nil and popupRoot:IsValid() then
        pcall(function() popupRoot:RemoveFromParent() end)
        pcall(function() popupRoot:SetVisibility(Visibility_COLLAPSED) end)
    end
    popupRoot = nil
    popupText = nil
    popupVisible = false
end

local function findLiveHud()
    local names = { "UI_HUD_C", "UI_HUD", "HUDWidget", "GlobalHUDWidget", "UI_GlobalHUD_C" }
    for _, name in ipairs(names) do
        local hud = FindFirstOf(name)
        if hud ~= nil and hud:IsValid() then
            return hud
        end
    end
    return nil
end

local function widgetClassName(obj)
    local name = "?"
    pcall(function()
        name = obj:GetClass():GetFName():ToString()
    end)
    return name
end

local function collectHostCandidates(hud)
    local list = {}
    local function add(obj, label)
        if obj ~= nil and obj:IsValid() then
            table.insert(list, { obj = obj, label = label or widgetClassName(obj) })
        end
    end

    add(hud.UnknownCardOverlay, "UnknownCardOverlay")
    add(hud.UI_HUDInteractablePopupContainer, "InteractablePopupContainer")
    add(hud.Warning_InvalidationBox, "Warning_InvalidationBox")

    local root = nil
    pcall(function()
        if hud.WidgetTree ~= nil and hud.WidgetTree:IsValid() then
            root = hud.WidgetTree.RootWidget
        end
    end)
    add(root, "RootWidget")
    add(hud, "UI_HUD")

    return list
end

--- Try attach like BackpackScrollBox: call AddChild* via pcall (do NOT type()-check UE methods).
local function tryAttach(host, border)
    local attempts = {
        function() return host:AddChild(border) end,
        function()
            local slot = host:AddChildToOverlay(border)
            pcall(function()
                if slot ~= nil then
                    if slot.SetHorizontalAlignment ~= nil then slot:SetHorizontalAlignment(0) end
                    if slot.SetVerticalAlignment ~= nil then slot:SetVerticalAlignment(0) end
                    if slot.SetPadding ~= nil then slot:SetPadding({ Left = 24, Top = 72, Right = 0, Bottom = 0 }) end
                end
            end)
            return slot
        end,
        function()
            local slot = host:AddChildToCanvas(border)
            pcall(function()
                if slot ~= nil then
                    if slot.SetAutoSize ~= nil then slot:SetAutoSize(true) end
                    if slot.SetPosition ~= nil then slot:SetPosition({ X = 24, Y = 72 }) end
                    if slot.SetAnchors ~= nil then
                        slot:SetAnchors({ Minimum = { X = 0, Y = 0 }, Maximum = { X = 0, Y = 0 } })
                    end
                    if slot.SetAlignment ~= nil then slot:SetAlignment({ X = 0, Y = 0 }) end
                end
            end)
            return slot
        end,
    }

    for _, fn in ipairs(attempts) do
        local ok = pcall(fn)
        if ok then
            return true
        end
    end
    return false
end

--- Build popup as Border+TextBlock children of the live HUD (safe path).
local function createPopupOnHud()
    destroyPopup()

    local hud = findLiveHud()
    if hud == nil then
        print("[GGDropmanCheatMenu] no live UI_HUD for popup\n")
        return false
    end
    print(string.format("[GGDropmanCheatMenu] HUD=%s class=%s\n", tostring(hud), widgetClassName(hud)))

    local BorderCls = StaticFindObject("/Script/UMG.Border")
    local TextCls = StaticFindObject("/Script/UMG.TextBlock")
    if BorderCls == nil or TextCls == nil then
        print("[GGDropmanCheatMenu] UMG Border/TextBlock missing\n")
        return false
    end

    local ok, err = pcall(function()
        -- Outer MUST be the live HUD widget (not GameInstance) -- matches backpack mod.
        local border = StaticConstructObject(BorderCls, hud, FName("GGDropmanHelpBorder"))
        if border == nil or not border:IsValid() then
            error("Border construct failed")
        end

        pcall(function() border:SetBrushColor(FLinearColor(0.02, 0.06, 0.04, 0.82)) end)
        pcall(function() border:SetPadding({ Left = 14, Top = 10, Right = 14, Bottom = 10 }) end)

        local textBlock = StaticConstructObject(TextCls, border, FName("GGDropmanHelpText"))
        if textBlock == nil or not textBlock:IsValid() then
            error("TextBlock construct failed")
        end

        pcall(function() textBlock.Font.Size = 15 end)
        pcall(function() textBlock:SetColorAndOpacity(FSlateColor(0.85, 1.0, 0.75, 1.0)) end)
        pcall(function() border:SetContent(textBlock) end)

        local attached = false
        local hosts = collectHostCandidates(hud)
        for _, h in ipairs(hosts) do
            print(string.format("[GGDropmanCheatMenu] try host %s (%s)\n", h.label, widgetClassName(h.obj)))
            if tryAttach(h.obj, border) then
                print(string.format("[GGDropmanCheatMenu] attached via %s\n", h.label))
                attached = true
                break
            end
        end

        if not attached then
            error("could not attach border to HUD host")
        end

        border.Visibility = Visibility_SELFHITTESTINVISIBLE
        textBlock.Visibility = Visibility_SELFHITTESTINVISIBLE

        popupRoot = border
        popupText = textBlock
        setPopupText(buildHelpText())
    end)

    if not ok then
        print("[GGDropmanCheatMenu] popup create failed: " .. tostring(err) .. "\n")
        destroyPopup()
        return false
    end

    print("[GGDropmanCheatMenu] in-game popup attached to HUD\n")
    return true
end

local function showOnScreenFallback(text)
    -- Shipping-safe-ish fallbacks if HUD attach fails.
    local ctx = Cheats.getPlayerController() or Cheats.getPawn()
    if ctx == nil then return end

    pcall(function()
        if type(ctx.ClientMessage) == "function" then
            ctx:ClientMessage(text, FName("None"), 8.0)
        end
    end)

    pcall(function()
        local ksl = StaticFindObject("/Script/Engine.Default__KismetSystemLibrary")
        if ksl ~= nil and ksl:IsValid() and type(ksl.PrintString) == "function" then
            -- One keyed message so it updates in place instead of stacking forever.
            ksl:PrintString(ctx, text, true, false, FLinearColor(0.7, 1.0, 0.55, 1.0), 10.0, FName("GGDropmanHelp"))
        end
    end)
end

local function scheduleAutoHide()
    popupHideToken = popupHideToken + 1
    local token = popupHideToken
    ExecuteWithDelay(POPUP_SECONDS * 1000, function()
        if token ~= popupHideToken then return end
        if not popupVisible then return end
        ExecuteInGameThread(function()
            if popupRoot ~= nil and popupRoot:IsValid() then
                pcall(function() popupRoot:SetVisibility(Visibility_HIDDEN) end)
            end
            popupVisible = false
            print("[GGDropmanCheatMenu] popup auto-hidden\n")
        end)
    end)
end

local function setPopupVisible(visible)
    popupVisible = visible and true or false
    if popupVisible then
        local ok = false
        if popupRoot == nil or not popupRoot:IsValid() then
            ok = createPopupOnHud()
        else
            ok = true
            pcall(function() popupRoot:SetVisibility(Visibility_SELFHITTESTINVISIBLE) end)
            setPopupText(buildHelpText())
        end
        printHelpConsole()
        if not ok then
            showOnScreenFallback(buildHelpText())
            print("[GGDropmanCheatMenu] used fallback on-screen text\n")
        end
        scheduleAutoHide()
    else
        if popupRoot ~= nil and popupRoot:IsValid() then
            pcall(function() popupRoot:SetVisibility(Visibility_HIDDEN) end)
        end
        print("[GGDropmanCheatMenu] popup hidden\n")
    end
end

local function togglePopup()
    setPopupVisible(not popupVisible)
end

local function runInGame(fn)
    ExecuteInGameThread(function()
        local ok, err = pcall(fn)
        if not ok then
            Cheats.LAST_STATUS = "[FAIL] " .. tostring(err)
            print("[GGDropmanCheatMenu] " .. Cheats.LAST_STATUS .. "\n")
        end
        if popupVisible then
            setPopupText(buildHelpText())
        end
    end)
end

local function cycleDupQty()
    if dupQty == 1 then dupQty = 5
    elseif dupQty == 5 then dupQty = 10
    elseif dupQty == 10 then dupQty = 25
    else dupQty = 1
    end
    Cheats.LAST_STATUS = string.format("[OK] Dup qty set to %d", dupQty)
    print("[GGDropmanCheatMenu] " .. Cheats.LAST_STATUS .. "\n")
end

local function doAction(action)
    print(string.format("[GGDropmanCheatMenu] key -> %s\n", tostring(action)))
    if action == "menu" then
        runInGame(function()
            togglePopup()
        end)
        return
    end
    if action == "qty" then
        cycleDupQty()
        if popupVisible then setPopupText(buildHelpText()) end
        return
    end
    runInGame(function()
        if action == "vitals" then
            Cheats.fillVitals()
        elseif action == "god" then
            Cheats.setGodMode(not Cheats._godEnabled)
        elseif action == "dup" then
            Cheats.duplicateHeld(dupQty)
        elseif action == "stacks" then
            Cheats.fillStacks(999)
        elseif action == "probe" then
            Cheats.probe()
        end
    end)
end

local function scheduleGodTick()
    ExecuteWithDelay(500, function()
        if Cheats._godEnabled then
            ExecuteInGameThread(function()
                pcall(function() Cheats.godTick() end)
            end)
        end
        scheduleGodTick()
    end)
end

local function bindKey(key, action)
    local fn = function() doAction(action) end
    if type(RegisterKeyBindAsync) == "function" then
        RegisterKeyBindAsync(key, fn)
    else
        RegisterKeyBind(key, fn)
    end
end

bindKey(Key.F8, "menu")
bindKey(Key.F6, "vitals")
bindKey(Key.F7, "god")
bindKey(Key.F9, "dup")
pcall(function() bindKey(Key.PAGE_UP, "qty") end)
bindKey(Key.F11, "stacks")
bindKey(Key.F12, "probe")

pcall(function()
    RegisterHook("/Script/Engine.PlayerController:ClientRestart", function()
        print("[GGDropmanCheatMenu] ClientRestart - world loaded\n")
        destroyPopup()
        ExecuteWithDelay(1500, function()
            ExecuteInGameThread(function()
                Cheats.probe()
            end)
        end)
    end)
end)

scheduleGodTick()

print("[GGDropmanCheatMenu] ready - F8 popup, F6 vitals, F7 god, F9 dup, PGUP qty, F11 stacks, F12 probe\n")
print("[GGDropmanCheatMenu] Discord: https://discord.gg/PTwyDTFyR\n")
