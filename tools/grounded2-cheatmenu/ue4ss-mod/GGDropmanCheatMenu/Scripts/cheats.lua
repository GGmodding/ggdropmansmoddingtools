-- GGDropman Grounded 2 Cheat Menu helpers (UE4SS Lua)
-- Uses reflection / UObject calls — not Cheat Engine offsets.

local M = {}

M.LAST_STATUS = "Ready. Press F8 for help overlay."

local function log(msg)
    print(string.format("[GGDropmanCheatMenu] %s\n", tostring(msg)))
end

local function setStatus(ok, msg)
    local prefix = ok and "OK" or "FAIL"
    M.LAST_STATUS = string.format("[%s] %s", prefix, tostring(msg))
    log(M.LAST_STATUS)
    return ok, msg
end

local function tryRequireUEHelpers()
    local ok, helpers = pcall(function()
        return require("UEHelpers")
    end)
    if ok and helpers ~= nil then
        return helpers
    end
    return nil
end

local UEHelpers = tryRequireUEHelpers()

function M.isValid(obj)
    return obj ~= nil and type(obj) == "userdata" and obj:IsValid()
end

function M.getPlayerController()
    if UEHelpers ~= nil and UEHelpers.GetPlayerController ~= nil then
        local pc = UEHelpers.GetPlayerController()
        if M.isValid(pc) then return pc end
    end
    local pc = FindFirstOf("PlayerController")
    if M.isValid(pc) then return pc end
    pc = FindFirstOf("SurvivalPlayerController")
    if M.isValid(pc) then return pc end
    return nil
end

function M.getPawn()
    if UEHelpers ~= nil and UEHelpers.GetPlayer ~= nil then
        local pawn = UEHelpers.GetPlayer()
        if M.isValid(pawn) then return pawn end
    end
    if UEHelpers ~= nil and UEHelpers.GetPlayerCharacter ~= nil then
        local pawn = UEHelpers.GetPlayerCharacter()
        if M.isValid(pawn) then return pawn end
    end
    local pc = M.getPlayerController()
    if not M.isValid(pc) then return nil end
    local pawn = pc.Pawn or pc.AcknowledgedPawn or pc.Character
    if M.isValid(pawn) then return pawn end
    -- Fallback: first possessed SurvivalPlayerCharacter-like pawn
    local cand = FindFirstOf("SurvivalPlayerCharacter")
    if M.isValid(cand) then return cand end
    cand = FindFirstOf("SurvivalCharacter")
    if M.isValid(cand) then return cand end
    return nil
end

function M.getInventory(pawn)
    pawn = pawn or M.getPawn()
    if not M.isValid(pawn) then return nil end
    local inv = pawn.InventoryComponent
    if M.isValid(inv) then return inv end
    return nil
end

function M.getEquipment(pawn)
    pawn = pawn or M.getPawn()
    if not M.isValid(pawn) then return nil end
    local eq = pawn.EquipmentComponent
    if M.isValid(eq) then return eq end
    return nil
end

function M.getHeldItem(pawn)
    local eq = M.getEquipment(pawn)
    if not M.isValid(eq) then return nil end
    local held = eq.MainHand
    if M.isValid(held) then return held end
    held = eq.OffHand
    if M.isValid(held) then return held end
    return nil
end

function M.getInventoryItems(inv)
    inv = inv or M.getInventory()
    if not M.isValid(inv) then return {} end
    local items = inv.Items
    if items == nil then return {} end
    local out = {}
    -- TArray userdata: try ForEach / numeric index / Get
    if type(items.ForEach) == "function" then
        items:ForEach(function(index, elem)
            local it = elem
            if type(elem) == "userdata" and elem.get ~= nil then
                it = elem:get()
            end
            if M.isValid(it) then
                table.insert(out, it)
            end
        end)
        return out
    end
    local n = 0
    if type(items.GetArrayNum) == "function" then
        n = items:GetArrayNum()
    elseif items.Num ~= nil then
        n = items.Num
    end
    for i = 1, (n or 0) do
        local it = items[i]
        if it == nil and type(items.Get) == "function" then
            it = items:Get(i - 1)
        end
        if M.isValid(it) then
            table.insert(out, it)
        end
    end
    return out
end

function M.inventoryStats(inv)
    inv = inv or M.getInventory()
    local items = M.getInventoryItems(inv)
    local sum, n = 0, 0
    for _, it in ipairs(items) do
        local s = it.StackSize
        if type(s) == "number" and s > 0 and s < 100000 then
            sum = sum + s
            n = n + 1
        end
    end
    return sum, n
end

function M.getItemRowHandle(item)
    if not M.isValid(item) then return nil end
    local handle = item.ItemDataRowHandle
    if handle == nil then return nil end
    -- NetCrc handle still exposes DataTable + RowName on the base struct
    local dt = handle.DataTable
    local row = handle.RowName
    if dt == nil then return nil end
    return { DataTable = dt, RowName = row }
end

function M.findItemContainerLibrary()
    local cdo = StaticFindObject("/Script/Maine.Default__ItemContainerFunctionLibrary")
    if M.isValid(cdo) then return cdo end
    local cls = StaticFindObject("/Script/Maine.ItemContainerFunctionLibrary")
    if M.isValid(cls) and cls.GetCDO ~= nil then
        cdo = cls:GetCDO()
        if M.isValid(cdo) then return cdo end
    end
    local found = FindFirstOf("ItemContainerFunctionLibrary")
    if M.isValid(found) then return found end
    return nil
end

--- Local create/add (preferred over ServerCreateAndAddItem).
--- SDK: static FAddItemResult CreateAndAddItem(UObject* Container, FDataTableRowHandle, int32 Count, bool bSpawnLeftoversInWorld)
function M.createAndAddItem(inv, rowHandle, count, spawnLeftovers)
    if not M.isValid(inv) then return false, "no inventory" end
    if rowHandle == nil or rowHandle.DataTable == nil then return false, "bad row handle" end
    count = math.floor(tonumber(count) or 1)
    if count < 1 then count = 1 end
    if spawnLeftovers == nil then spawnLeftovers = true end

    -- Ensure we only pass the 0x10 base handle (DataTable + RowName), not NetCrc extras.
    local handle = {
        DataTable = rowHandle.DataTable,
        RowName = rowHandle.RowName,
    }

    local lib = M.findItemContainerLibrary()
    if not M.isValid(lib) then
        return false, "ItemContainerFunctionLibrary not found"
    end

    local beforeSum, beforeN = M.inventoryStats(inv)
    local okCall, err = pcall(function()
        -- Static Blueprint library: call on CDO / class default object.
        if type(lib.CreateAndAddItem) == "function" then
            lib:CreateAndAddItem(inv, handle, count, spawnLeftovers)
        elseif type(lib.CallFunction) == "function" then
            lib:CallFunction("CreateAndAddItem", inv, handle, count, spawnLeftovers)
        else
            error("no CreateAndAddItem callable on library")
        end
    end)
    if not okCall then
        return false, "CreateAndAddItem call error: " .. tostring(err)
    end
    local afterSum, afterN = M.inventoryStats(inv)
    local delta = afterSum - beforeSum
    if delta > 0 or afterN > beforeN then
        return true, string.format("added stacks +%d (sum %d->%d, slots %d->%d)", delta, beforeSum, afterSum, beforeN, afterN)
    end
    return false, string.format("CreateAndAddItem ran but inventory unchanged (sum %d->%d)", beforeSum, afterSum)
end

function M.duplicateHeld(qty)
    qty = math.floor(tonumber(qty) or 1)
    if qty < 1 then qty = 1 end
    local pawn = M.getPawn()
    if not M.isValid(pawn) then return setStatus(false, "no local pawn — load into a world") end
    local inv = M.getInventory(pawn)
    if not M.isValid(inv) then return setStatus(false, "no InventoryComponent") end
    local held = M.getHeldItem(pawn)
    if not M.isValid(held) then
        -- fallback: first bag item
        local items = M.getInventoryItems(inv)
        held = items[1]
    end
    if not M.isValid(held) then return setStatus(false, "no held/bag item to duplicate") end
    local handle = M.getItemRowHandle(held)
    if handle == nil then return setStatus(false, "item has no ItemDataRowHandle") end
    local ok, msg = M.createAndAddItem(inv, handle, qty, true)
    return setStatus(ok, msg)
end

function M.fillStacks(target)
    target = math.floor(tonumber(target) or 999)
    local inv = M.getInventory()
    if not M.isValid(inv) then return setStatus(false, "no InventoryComponent") end
    local items = M.getInventoryItems(inv)
    if #items == 0 then return setStatus(false, "bag empty — open bag / pick something up") end
    local n = 0
    for _, it in ipairs(items) do
        local s = it.StackSize
        if type(s) == "number" and s >= 1 and s < 100000 then
            it.StackSize = target
            n = n + 1
        end
    end
    if n == 0 then return setStatus(false, "no writable StackSize fields") end
    return setStatus(true, string.format("set StackSize=%d on %d item(s)", target, n))
end

function M.fillVitals()
    local pawn = M.getPawn()
    if not M.isValid(pawn) then return setStatus(false, "no local pawn") end

    local notes = {}
    local hc = pawn.HealthComponent
    if M.isValid(hc) then
        local okSet = pcall(function()
            if type(hc.SetCurrentDamage) == "function" then
                hc:SetCurrentDamage(0)
            else
                hc.CurrentDamage = 0
            end
        end)
        if okSet then table.insert(notes, "CurrentDamage=0") end
        pcall(function()
            if type(hc.SetCurrentHealth) == "function" and hc.MaxHealth ~= nil then
                hc:SetCurrentHealth(hc.MaxHealth)
                table.insert(notes, "HP full")
            end
        end)
    else
        table.insert(notes, "no HealthComponent")
    end

    local sc = pawn.StaminaComponent
    if M.isValid(sc) then
        local mx = sc.MaxStamina
        if mx == nil and type(sc.GetMaxStamina) == "function" then
            pcall(function() mx = sc:GetMaxStamina() end)
        end
        if mx ~= nil and sc.CurrentStamina ~= nil then
            sc.CurrentStamina = mx
            table.insert(notes, "stamina full")
        else
            table.insert(notes, "stamina fields missing")
        end
    else
        table.insert(notes, "no StaminaComponent")
    end

    local sv = pawn.SurvivalComponent
    if M.isValid(sv) then
        local foodOk = pcall(function()
            if type(sv.SetCurrentFood) == "function" then
                sv:SetCurrentFood(100)
            else
                sv.CurrentFood = 100
            end
        end)
        if foodOk then table.insert(notes, "CurrentFood=100") end

        local waterOk = pcall(function()
            if type(sv.SetCurrentWater) == "function" then
                sv:SetCurrentWater(100)
            else
                sv.CurrentWater = 100
            end
        end)
        if waterOk then table.insert(notes, "CurrentWater=100") end

        local breathOk = pcall(function()
            if type(sv.RestoreFullBreath) == "function" then
                sv:RestoreFullBreath()
            elseif type(sv.SetCurrentBreath) == "function" then
                sv:SetCurrentBreath(100)
            else
                sv.CurrentBreath = 100
            end
        end)
        if breathOk then table.insert(notes, "breath full") end
    else
        table.insert(notes, "no SurvivalComponent")
    end

    return setStatus(true, table.concat(notes, "; "))
end

M._godEnabled = false
M._godTimer = nil

function M.setGodMode(enabled)
    M._godEnabled = enabled and true or false
    if M._godEnabled then
        M.fillVitals()
        return setStatus(true, "God Mode ON (refills vitals while enabled via F8 menu tick)")
    end
    return setStatus(true, "God Mode OFF")
end

function M.godTick()
    if not M._godEnabled then return end
    local pawn = M.getPawn()
    if not M.isValid(pawn) then return end
    local hc = pawn.HealthComponent
    if M.isValid(hc) then
        pcall(function()
            if type(hc.SetCurrentDamage) == "function" then
                hc:SetCurrentDamage(0)
            else
                hc.CurrentDamage = 0
            end
        end)
    end
    local sc = pawn.StaminaComponent
    if M.isValid(sc) and sc.CurrentStamina ~= nil then
        local mx = sc.MaxStamina
        if mx == nil and type(sc.GetMaxStamina) == "function" then
            pcall(function() mx = sc:GetMaxStamina() end)
        end
        if mx ~= nil then sc.CurrentStamina = mx end
    end
    local sv = pawn.SurvivalComponent
    if M.isValid(sv) then
        pcall(function()
            if type(sv.SetCurrentFood) == "function" then sv:SetCurrentFood(100) else sv.CurrentFood = 100 end
            if type(sv.SetCurrentWater) == "function" then sv:SetCurrentWater(100) else sv.CurrentWater = 100 end
            if type(sv.RestoreFullBreath) == "function" then sv:RestoreFullBreath()
            elseif type(sv.SetCurrentBreath) == "function" then sv:SetCurrentBreath(100)
            else sv.CurrentBreath = 100 end
        end)
    end
end

function M.probe()
    local pawn = M.getPawn()
    local inv = M.getInventory(pawn)
    local held = M.getHeldItem(pawn)
    local sum, n = M.inventoryStats(inv)
    local lib = M.findItemContainerLibrary()
    local msg = string.format(
        "pawn=%s inv=%s held=%s bagSlots=%d stackSum=%d lib=%s",
        M.isValid(pawn) and "yes" or "no",
        M.isValid(inv) and "yes" or "no",
        M.isValid(held) and "yes" or "no",
        n,
        sum,
        M.isValid(lib) and "yes" or "no"
    )
    return setStatus(M.isValid(pawn), msg)
end

return M
