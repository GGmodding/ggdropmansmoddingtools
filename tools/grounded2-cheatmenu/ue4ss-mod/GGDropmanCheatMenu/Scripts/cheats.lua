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

local MOVE_Flying = 5
local MOVE_Walking = 1
local COLLISION_NoCollision = 0
local COLLISION_QueryAndPhysics = 3

function M.getCMC(pawn)
    pawn = pawn or M.getPawn()
    if not M.isValid(pawn) then return nil end
    local cm = pawn.CharMovementComponent
    if M.isValid(cm) then return cm end
    cm = pawn.CharacterMovement
    if M.isValid(cm) then return cm end
    cm = pawn.MovementComponent
    if M.isValid(cm) then return cm end
    return nil
end

function M.getCapsule(pawn)
    pawn = pawn or M.getPawn()
    if not M.isValid(pawn) then return nil end
    local cap = pawn.CapsuleComponent
    if M.isValid(cap) then return cap end
    return nil
end

local function saneSpeed(v, fallback)
    if type(v) ~= "number" or v ~= v then return fallback end
    if v < 50 or v > 20000 then return fallback end
    return v
end

local function setFlyMode(cm, pawn, on)
    if not M.isValid(cm) then return end
    if on then
        pcall(function()
            if type(cm.SetMovementMode) == "function" then
                cm:SetMovementMode(MOVE_Flying)
            else
                cm.MovementMode = MOVE_Flying
            end
        end)
        pcall(function() cm.DefaultLandMovementMode = MOVE_Flying end)
        pcall(function() cm.GravityScale = 0 end)
        pcall(function() cm.CurrentGravityScaleOverride = 0 end)
        pcall(function() cm.AirControl = 1.0 end)
        pcall(function() cm.bCheatFlying = true end)
        if M.isValid(pawn) then
            pcall(function() pawn.ReplicatedMovementMode = MOVE_Flying end)
        end
    else
        pcall(function()
            if type(cm.SetMovementMode) == "function" then
                cm:SetMovementMode(MOVE_Walking)
            else
                cm.MovementMode = MOVE_Walking
            end
        end)
        pcall(function() cm.DefaultLandMovementMode = MOVE_Walking end)
        pcall(function() cm.bCheatFlying = false end)
        if M.isValid(pawn) then
            pcall(function() pawn.ReplicatedMovementMode = MOVE_Walking end)
        end
    end
end

local function setCollisionOff(pawn, off)
    if not M.isValid(pawn) then return end
    pcall(function()
        if type(pawn.SetActorEnableCollision) == "function" then
            pawn:SetActorEnableCollision(not off)
        end
    end)
    local cap = M.getCapsule(pawn)
    if M.isValid(cap) then
        pcall(function()
            if type(cap.SetCollisionEnabled) == "function" then
                cap:SetCollisionEnabled(off and COLLISION_NoCollision or COLLISION_QueryAndPhysics)
            else
                cap.CollisionEnabled = off and COLLISION_NoCollision or COLLISION_QueryAndPhysics
            end
        end)
    end
end

M._speedEnabled = false
M._speedMult = 5.0
M._speedBase = nil

function M.applySpeedTick()
    if not M._speedEnabled then return end
    local pawn = M.getPawn()
    local cm = M.getCMC(pawn)
    if not M.isValid(cm) then return end
    local b = M._speedBase
    if b == nil then return end
    local m = M._speedMult
    pcall(function() cm.MaxWalkSpeed = b.walk * m end)
    pcall(function() cm.MaxWalkSpeedCrouched = b.crouch * m end)
    pcall(function() cm.MaxFlySpeed = b.fly * m end)
    pcall(function() cm.CurrentMaxGroundSpeed = b.curGround * m end)
    pcall(function() cm.MaxSprintSpeed = b.sprint * m end)
    pcall(function() cm.MaxFlySprintSpeed = b.flySprint * m end)
    pcall(function() cm.CustomGroundSpeedMultiplier = m end)
end

function M.setSpeed(enabled, mult)
    mult = tonumber(mult) or M._speedMult or 5.0
    if mult < 1 then mult = 1 end
    if mult > 50 then mult = 50 end
    M._speedMult = mult

    if not enabled then
        local pawn = M.getPawn()
        local cm = M.getCMC(pawn)
        local b = M._speedBase
        if M.isValid(cm) and b ~= nil then
            pcall(function() cm.MaxWalkSpeed = b.walk end)
            pcall(function() cm.MaxWalkSpeedCrouched = b.crouch end)
            pcall(function() cm.MaxFlySpeed = b.fly end)
            pcall(function() cm.CurrentMaxGroundSpeed = b.curGround end)
            pcall(function() cm.MaxSprintSpeed = b.sprint end)
            pcall(function() cm.MaxFlySprintSpeed = b.flySprint end)
            pcall(function() cm.CustomGroundSpeedMultiplier = b.customMult end)
        end
        M._speedEnabled = false
        M._speedBase = nil
        return setStatus(true, "Speed OFF")
    end

    local pawn = M.getPawn()
    local cm = M.getCMC(pawn)
    if not M.isValid(cm) then
        return setStatus(false, "no CharMovementComponent — load into a world")
    end

    local walk = saneSpeed(cm.MaxWalkSpeed, 600)
    local crouch = saneSpeed(cm.MaxWalkSpeedCrouched, walk * 0.5)
    local fly = saneSpeed(cm.MaxFlySpeed, walk)
    local curGround = saneSpeed(cm.CurrentMaxGroundSpeed, walk)
    local sprint = saneSpeed(cm.MaxSprintSpeed, walk * 1.5)
    local flySprint = saneSpeed(cm.MaxFlySprintSpeed, sprint)
    local customMult = cm.CustomGroundSpeedMultiplier
    if type(customMult) ~= "number" or customMult ~= customMult then customMult = 1 end

    M._speedBase = {
        walk = walk,
        crouch = crouch,
        fly = fly,
        curGround = curGround,
        sprint = sprint,
        flySprint = flySprint,
        customMult = customMult,
    }
    M._speedEnabled = true
    M.applySpeedTick()
    return setStatus(true, string.format("Speed x%.0f ON (walk %.0f -> %.0f)", mult, walk, walk * mult))
end

M._noclipEnabled = false
M._noclipMult = 5.0
M._noclipBase = nil

function M.applyNoclipTick()
    if not M._noclipEnabled then return end
    local pawn = M.getPawn()
    local cm = M.getCMC(pawn)
    if not M.isValid(cm) then return end
    local b = M._noclipBase
    if b == nil then return end
    local m = M._noclipMult
    setFlyMode(cm, pawn, true)
    setCollisionOff(pawn, true)
    pcall(function() cm.MaxFlySpeed = b.fly * m end)
    pcall(function() cm.MaxFlySprintSpeed = b.flySprint * m end)
    pcall(function() cm.CustomFlySpeedMultiplier = m end)
    pcall(function() cm.GravityScale = 0 end)
    pcall(function() cm.CurrentGravityScaleOverride = 0 end)
end

function M.setNoclip(enabled, mult)
    mult = tonumber(mult) or M._noclipMult or 5.0
    if mult < 1 then mult = 1 end
    if mult > 50 then mult = 50 end
    M._noclipMult = mult

    local pawn = M.getPawn()
    local cm = M.getCMC(pawn)
    if not enabled then
        local b = M._noclipBase
        if M.isValid(cm) and b ~= nil then
            setFlyMode(cm, pawn, false)
            pcall(function() cm.GravityScale = b.gravity end)
            pcall(function() cm.CurrentGravityScaleOverride = b.gravOverride end)
            pcall(function() cm.MaxFlySpeed = b.fly end)
            pcall(function() cm.MaxFlySprintSpeed = b.flySprint end)
            pcall(function() cm.CustomFlySpeedMultiplier = b.customFly end)
            pcall(function() cm.AirControl = b.air end)
        end
        setCollisionOff(pawn, false)
        M._noclipEnabled = false
        M._noclipBase = nil
        return setStatus(true, "Noclip OFF (walking + collision restored)")
    end

    if not M.isValid(cm) then
        return setStatus(false, "no CharMovementComponent — load into a world")
    end

    local gravity = cm.GravityScale
    if type(gravity) ~= "number" or gravity ~= gravity then gravity = 1 end
    local gravOverride = cm.CurrentGravityScaleOverride
    if type(gravOverride) ~= "number" or gravOverride ~= gravOverride then gravOverride = 1 end
    local fly = saneSpeed(cm.MaxFlySpeed, 600)
    local flySprint = saneSpeed(cm.MaxFlySprintSpeed, fly)
    local customFly = cm.CustomFlySpeedMultiplier
    if type(customFly) ~= "number" or customFly ~= customFly then customFly = 1 end
    local air = cm.AirControl
    if type(air) ~= "number" or air ~= air then air = 0.05 end

    M._noclipBase = {
        gravity = gravity,
        gravOverride = gravOverride,
        fly = fly,
        flySprint = flySprint,
        customFly = customFly,
        air = air,
    }
    M._noclipEnabled = true
    M.applyNoclipTick()
    return setStatus(true, string.format("Noclip fly ON x%.0f (collision off)", mult))
end

function M.movementTick()
    if M._speedEnabled then M.applySpeedTick() end
    if M._noclipEnabled then M.applyNoclipTick() end
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
