const fs = require("fs");
const path = require("path");

const scene = fs.readFileSync("C:/Users/Owner/Desktop/slot0000/scene-objects.bin");
const dll = fs.readFileSync(
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/Managed/Assembly-CSharp.dll"
);

function readVarint(buf, i) {
  let x = 0,
    s = 0;
  while (i < buf.length) {
    const b = buf[i++];
    x |= (b & 127) << s;
    if (!(b & 128)) break;
    s += 7;
    if (s > 56) break;
  }
  return [x >>> 0, i];
}

// --- Extract StoryGoalManager completed goal strings via scan ---
function extractSgmGoals(buf) {
  const name = Buffer.from("Story.StoryGoalManager");
  const at = buf.indexOf(name);
  if (at < 0) return null;
  // After name: 10 01 then mystery header then repeated 0x12 strings
  let i = at + name.length;
  if (buf[i] === 0x10) {
    const [, j] = readVarint(buf, i + 1);
    i = j;
  }
  // Find first 0x12 that starts a printable string of len>=3
  const goals = [];
  const end = Math.min(buf.length, at + 8000);
  // Skip until we see pattern 12 <len> ASCII
  while (i < end) {
    if (buf[i] === 0x12) {
      const [len, ni] = readVarint(buf, i + 1);
      if (len >= 3 && len <= 80 && ni + len <= end) {
        const s = buf.subarray(ni, ni + len);
        let ok = true;
        for (const b of s) {
          if (b < 32 || b > 126) {
            ok = false;
            break;
          }
        }
        if (ok) {
          goals.push(s.toString("utf8"));
          i = ni + len;
          continue;
        }
      }
    }
    // stop if we hit another component name field 0a with PascalCase
    if (buf[i] === 0x0a) {
      const [len, ni] = readVarint(buf, i + 1);
      if (len >= 4 && len <= 40 && ni + len < end) {
        const s = buf.subarray(ni, ni + len).toString("utf8");
        if (/^[A-Z][A-Za-z0-9_.]+$/.test(s) && goals.length > 5) break;
      }
    }
    if (goals.length && buf[i] !== 0x12 && buf[i] !== 0x08 && buf[i] !== 0x10) {
      // allow a few non-string fields after goals start; if too many skips, stop
    }
    i++;
    if (goals.length > 0 && i > at + 5000) break;
  }
  return { at, goals };
}

const sgm = extractSgmGoals(scene);
console.log("SGM goals count", sgm.goals.length);
console.log(sgm.goals.join("\n"));

// Classify goal-like vs PDA-like
const pdaish = sgm.goals.filter((g) =>
  /PDA|Terminal|Databank|Ency|Log|Radio|Aurora_|Degasi|Precursor|Sunbeam|Infection|Emperor|Quarantine|Scan|Sample/i.test(
    g
  )
);
console.log("\nPDA-ish goals", pdaish.length, pdaish);

// --- Parse PE/#~ metadata for type/field names around PDA* ---
function parseCliStrings(buf) {
  // Find CLI metadata root
  if (buf.toString("ascii", 0, 2) !== "MZ") throw new Error("not PE");
  const e_lfanew = buf.readUInt32LE(0x3c);
  if (buf.toString("ascii", e_lfanew, e_lfanew + 4) !== "PE\0\0") throw new Error("no PE");
  const coff = e_lfanew + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const peMagic = buf.readUInt16LE(opt);
  const isPE32Plus = peMagic === 0x20b;
  const dataDirOff = opt + (isPE32Plus ? 112 : 96);
  const cliRva = buf.readUInt32LE(dataDirOff + 14 * 8);
  const sections = [];
  const secStart = opt + optSize;
  for (let i = 0; i < numSections; i++) {
    const o = secStart + i * 40;
    sections.push({
      name: buf.toString("ascii", o, o + 8).replace(/\0.*/, ""),
      vsize: buf.readUInt32LE(o + 8),
      va: buf.readUInt32LE(o + 12),
      rawSize: buf.readUInt32LE(o + 16),
      rawPtr: buf.readUInt32LE(o + 20),
    });
  }
  function rvaToOff(rva) {
    for (const s of sections) {
      if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) {
        return s.rawPtr + (rva - s.va);
      }
    }
    return -1;
  }
  const cliOff = rvaToOff(cliRva);
  const metaRva = buf.readUInt32LE(cliOff + 8);
  const metaOff = rvaToOff(metaRva);
  if (buf.toString("ascii", metaOff, metaOff + 4) !== "BSJB") throw new Error("no metadata");
  const verLen = buf.readUInt32LE(metaOff + 12);
  const verPad = (verLen + 3) & ~3;
  const streamHdrStart = metaOff + 16 + verPad + 2 + 2;
  let nStreams = buf.readUInt16LE(metaOff + 16 + verPad + 2);
  let p = streamHdrStart;
  const streams = {};
  for (let i = 0; i < nStreams; i++) {
    const off = buf.readUInt32LE(p);
    const size = buf.readUInt32LE(p + 4);
    let name = "";
    let q = p + 8;
    while (buf[q] !== 0) {
      name += String.fromCharCode(buf[q++]);
    }
    q++;
    while ((q - (p + 8)) % 4 !== 0) q++;
    streams[name] = { off: metaOff + off, size };
    p = q;
  }
  console.log("streams", Object.keys(streams));
  // #Strings
  const strHeap = streams["#Strings"];
  function getStr(idx) {
    let i = strHeap.off + idx;
    let s = "";
    while (buf[i]) s += String.fromCharCode(buf[i++]);
    return s;
  }
  // #US
  const usHeap = streams["#US"];
  function getUS(idx) {
    // idx is 1-based blob with compressed length
    let i = usHeap.off + idx;
    let len = buf[i];
    let hdr = 1;
    if ((len & 0x80) === 0) {
      /* 1 byte */
    } else if ((len & 0xc0) === 0x80) {
      len = ((len & 0x3f) << 8) | buf[i + 1];
      hdr = 2;
    } else {
      len =
        ((len & 0x1f) << 24) |
        (buf[i + 1] << 16) |
        (buf[i + 2] << 8) |
        buf[i + 3];
      hdr = 4;
    }
    // UTF16, last byte is marker
    const bytes = buf.subarray(i + hdr, i + hdr + len - 1);
    return bytes.toString("utf16le");
  }
  // #~ tables
  const tilde = streams["#~"];
  const t = tilde.off;
  const heapSizes = buf[t + 6];
  const stringIdxSize = heapSizes & 1 ? 4 : 2;
  const guidIdxSize = heapSizes & 2 ? 4 : 2;
  const blobIdxSize = heapSizes & 4 ? 4 : 2;
  const valid = buf.readBigUInt64LE(t + 8);
  const sorted = buf.readBigUInt64LE(t + 16);
  // row counts for present tables
  let rcOff = t + 24;
  const rowCounts = {};
  for (let bit = 0; bit < 64; bit++) {
    if ((valid >> BigInt(bit)) & 1n) {
      rowCounts[bit] = buf.readUInt32LE(rcOff);
      rcOff += 4;
    }
  }
  function readIdx(off, size) {
    return size === 4 ? buf.readUInt32LE(off) : buf.readUInt16LE(off);
  }
  // Compute coded index sizes roughly for TypeDefOrRef etc. - simplified approach:
  // Walk TypeDef table (0x02) with known layout assuming common sizes
  const Table = {
    Module: 0,
    TypeRef: 1,
    TypeDef: 2,
    Field: 4,
    MethodDef: 6,
    Param: 8,
    InterfaceImpl: 9,
    MemberRef: 10,
    Constant: 11,
    CustomAttribute: 12,
    FieldMarshal: 13,
    DeclSecurity: 14,
    ClassLayout: 15,
    FieldLayout: 16,
    StandAloneSig: 17,
    EventMap: 18,
    Event: 20,
    PropertyMap: 21,
    Property: 23,
    MethodSemantics: 24,
    MethodImpl: 25,
    ModuleRef: 26,
    TypeSpec: 27,
    ImplMap: 28,
    FieldRVA: 29,
    Assembly: 32,
    AssemblyRef: 35,
    NestedClass: 41,
  };

  // Determine coded index sizes
  function maxRows(tables) {
    let m = 0;
    for (const t of tables) m = Math.max(m, rowCounts[t] || 0);
    return m;
  }
  function codedSize(tagBits, tables) {
    return maxRows(tables) < 1 << (16 - tagBits) ? 2 : 4;
  }
  const TypeDefOrRefSize = codedSize(2, [Table.TypeDef, Table.TypeRef, Table.TypeSpec]);
  const HasConstantSize = codedSize(2, [Table.Field, Table.Param, Table.Property]);
  const HasCustomAttributeSize = codedSize(5, [
    Table.MethodDef,
    Table.Field,
    Table.TypeRef,
    Table.TypeDef,
    Table.Param,
    Table.InterfaceImpl,
    Table.MemberRef,
    Table.Module,
    /*DeclSecurity*/ 14,
    Table.Property,
    Table.Event,
    Table.StandAloneSig,
    Table.ModuleRef,
    Table.TypeSpec,
    Table.Assembly,
    Table.AssemblyRef,
    /*File*/ 38,
    /*ExportedType*/ 39,
    /*ManifestResource*/ 40,
    /*GenericParam*/ 42,
    /*GenericParamConstraint*/ 44,
    /*MethodSpec*/ 43,
  ]);
  const HasFieldMarshalSize = codedSize(1, [Table.Field, Table.Param]);
  const HasDeclSecuritySize = codedSize(2, [Table.TypeDef, Table.MethodDef, Table.Assembly]);
  const MemberRefParentSize = codedSize(3, [
    Table.TypeDef,
    Table.TypeRef,
    Table.ModRef || 26,
    Table.MethodDef,
    Table.TypeSpec,
  ]);
  const HasSemanticsSize = codedSize(1, [Table.Event, Table.Property]);
  const MethodDefOrRefSize = codedSize(1, [Table.MethodDef, Table.MemberRef]);
  const MemberForwardedSize = codedSize(1, [Table.Field, Table.MethodDef]);
  const ImplementationSize = codedSize(2, [Table.File || 38, Table.AssemblyRef, Table.ExportedType || 39]);
  const CustomAttributeTypeSize = codedSize(3, [Table.MethodDef, Table.MemberRef]);
  const ResolutionScopeSize = codedSize(2, [
    Table.Module,
    Table.ModuleRef,
    Table.AssemblyRef,
    Table.TypeRef,
  ]);
  const TypeOrMethodDefSize = codedSize(1, [Table.TypeDef, Table.MethodDef]);

  const fieldIdxSize = (rowCounts[Table.Field] || 0) < 65536 ? 2 : 4;
  const methodIdxSize = (rowCounts[Table.MethodDef] || 0) < 65536 ? 2 : 4;
  const paramIdxSize = (rowCounts[Table.Param] || 0) < 65536 ? 2 : 4;
  const eventIdxSize = (rowCounts[Table.Event] || 0) < 65536 ? 2 : 4;
  const propertyIdxSize = (rowCounts[Table.Property] || 0) < 65536 ? 2 : 4;

  // Table row sizes (approximate ECMA)
  const rowSize = {};
  rowSize[Table.Module] = 2 + stringIdxSize + guidIdxSize * 3;
  rowSize[Table.TypeRef] = ResolutionScopeSize + stringIdxSize * 2;
  rowSize[Table.TypeDef] =
    4 + stringIdxSize * 2 + TypeDefOrRefSize + fieldIdxSize + methodIdxSize;
  rowSize[Table.Field] = 2 + stringIdxSize + blobIdxSize;
  rowSize[Table.MethodDef] = 4 + 2 + 2 + stringIdxSize + blobIdxSize + paramIdxSize;
  rowSize[Table.Param] = 2 + 2 + stringIdxSize;
  rowSize[Table.InterfaceImpl] = 2 + TypeDefOrRefSize; // TypeDef index may be 2/4
  // Fix InterfaceImpl - TypeDef index size
  const typeDefIdxSize = (rowCounts[Table.TypeDef] || 0) < 65536 ? 2 : 4;
  rowSize[Table.InterfaceImpl] = typeDefIdxSize + TypeDefOrRefSize;
  rowSize[Table.MemberRef] = MemberRefParentSize + stringIdxSize + blobIdxSize;
  rowSize[Table.Constant] = 2 + HasConstantSize + blobIdxSize; // +1 pad?
  rowSize[Table.CustomAttribute] = HasCustomAttributeSize + CustomAttributeTypeSize + blobIdxSize;
  rowSize[Table.NestedClass] = typeDefIdxSize + typeDefIdxSize;

  // Compute table starts
  let tableData = rcOff;
  const tableOff = {};
  for (let bit = 0; bit < 64; bit++) {
    if ((valid >> BigInt(bit)) & 1n) {
      tableOff[bit] = tableData;
      const rs = rowSize[bit];
      const rc = rowCounts[bit] || 0;
      if (!rs) {
        // unknown size - can't continue accurately for later tables
        // store and break careful path
      }
      tableData += (rs || 0) * rc;
    }
  }

  console.log(
    "TypeDef rows",
    rowCounts[Table.TypeDef],
    "Field rows",
    rowCounts[Table.Field],
    "MethodDef",
    rowCounts[Table.MethodDef]
  );

  // Read all TypeDefs
  const types = [];
  const tdOff = tableOff[Table.TypeDef];
  const tdSize = rowSize[Table.TypeDef];
  const tdRows = rowCounts[Table.TypeDef] || 0;
  for (let i = 0; i < tdRows; i++) {
    const o = tdOff + i * tdSize;
    let p = o;
    const flags = buf.readUInt32LE(p);
    p += 4;
    const nameIdx = readIdx(p, stringIdxSize);
    p += stringIdxSize;
    const nsIdx = readIdx(p, stringIdxSize);
    p += stringIdxSize;
    p += TypeDefOrRefSize; // extends
    const fieldList = readIdx(p, fieldIdxSize);
    p += fieldIdxSize;
    const methodList = readIdx(p, methodIdxSize);
    const name = getStr(nameIdx);
    const ns = getStr(nsIdx);
    types.push({ i: i + 1, flags, name, ns, fieldList, methodList });
  }
  // Attach field ends
  for (let i = 0; i < types.length; i++) {
    types[i].fieldListEnd =
      i + 1 < types.length ? types[i + 1].fieldList : (rowCounts[Table.Field] || 0) + 1;
    types[i].methodListEnd =
      i + 1 < types.length ? types[i + 1].methodList : (rowCounts[Table.MethodDef] || 0) + 1;
  }

  const interesting = types.filter((t) =>
    /PDAEncyclopedia|PDALog|PDAScanner|KnownTech|PDAData|^Player$/.test(t.name)
  );
  console.log(
    "\nInteresting types:"
  );
  for (const t of interesting) {
    console.log(`- [${t.i}] ${t.ns}.${t.name} fields ${t.fieldList}..${t.fieldListEnd - 1}`);
  }

  // Read fields for those types
  const fdOff = tableOff[Table.Field];
  const fdSize = rowSize[Table.Field];
  function fieldsFor(t) {
    const out = [];
    for (let fi = t.fieldList; fi < t.fieldListEnd; fi++) {
      const o = fdOff + (fi - 1) * fdSize;
      const flags = buf.readUInt16LE(o);
      const nameIdx = readIdx(o + 2, stringIdxSize);
      const name = getStr(nameIdx);
      out.push({ fi, flags, name });
    }
    return out;
  }
  function methodsFor(t) {
    const out = [];
    const mdOff = tableOff[Table.MethodDef];
    const mdSize = rowSize[Table.MethodDef];
    for (let mi = t.methodList; mi < t.methodListEnd; mi++) {
      const o = mdOff + (mi - 1) * mdSize;
      const rva = buf.readUInt32LE(o);
      const nameIdx = readIdx(o + 8, stringIdxSize); // 4+2+2=8
      // verify layout: RVA(4) ImplFlags(2) Flags(2) Name(string) Signature(blob) ParamList
      const name = getStr(nameIdx);
      out.push({ mi, rva, name });
    }
    return out;
  }

  for (const t of interesting) {
    console.log(`\n=== ${t.ns}.${t.name} fields ===`);
    console.log(fieldsFor(t).map((f) => f.name).join(", "));
    console.log(`=== methods ===`);
    console.log(methodsFor(t).map((m) => m.name).join(", "));
  }

  // Nested classes: find PDAEncyclopedia nested
  const nested = types.filter(
    (t) =>
      t.name === "Entry" ||
      t.name === "EntryData" ||
      t.name === "Data" ||
      t.name === "Entries" ||
      t.name === "SerializeData" ||
      t.name === "EntriesData"
  );
  // Use NestedClass table if available
  if (tableOff[Table.NestedClass] && rowSize[Table.NestedClass]) {
    const ncOff = tableOff[Table.NestedClass];
    const ncSize = rowSize[Table.NestedClass];
    const ncRows = rowCounts[Table.NestedClass] || 0;
    const byEnclosing = {};
    for (let i = 0; i < ncRows; i++) {
      const o = ncOff + i * ncSize;
      const nestedIdx = readIdx(o, typeDefIdxSize);
      const enclIdx = readIdx(o + typeDefIdxSize, typeDefIdxSize);
      const nestedT = types[nestedIdx - 1];
      const enclT = types[enclIdx - 1];
      if (!enclT || !nestedT) continue;
      if (/PDAEncyclopedia|PDALog|PDAScanner|KnownTech|Player/.test(enclT.name)) {
        console.log(`Nested: ${enclT.name}/${nestedT.name}`);
        console.log("  fields:", fieldsFor(nestedT).map((f) => f.name).join(", "));
        console.log("  methods:", methodsFor(nestedT).map((m) => m.name).join(", "));
      }
    }
  }

  return { types, fieldsFor, methodsFor, getStr, rvaToOff, buf };
}

const cli = parseCliStrings(dll);

// Search #US for ProtoMember-related won't work; search custom attribute blobs is hard.
// Instead dump method bodies names we care about and look for ldstr in IL around Serialize

function dumpMethodIL(typeName, methodName, maxBytes = 400) {
  const t = cli.types.find((x) => x.name === typeName || x.name.endsWith(typeName));
  if (!t) {
    console.log("type missing", typeName);
    return;
  }
  const methods = cli.methodsFor
    ? null
    : null;
}

// Re-get methods via closure - redefine
function getMethods(t) {
  // reparse quickly from earlier pattern - store on cli
  return null;
}

// Extract encyclopedia keys from resources.assets via string patterns
const assetsPath =
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/resources.assets";
console.log("\nScanning resources.assets for Ency keys (stream)...");
const fd = fs.openSync(assetsPath, "r");
const st = fs.fstatSync(fd);
const chunkSize = 16 * 1024 * 1024;
const overlap = 256;
let prev = Buffer.alloc(0);
const encyKeys = new Set();
const pathKeys = new Set();
const keyRe = /Ency_([A-Za-z0-9_]+)/g;
const pathRe = /(?:Lifeforms|Tech|DownloadedData|Artifacts|Codes|TimeCapsules)\/[A-Za-z0-9_\/]+/g;
let offset = 0;
while (offset < st.size) {
  const need = Math.min(chunkSize, st.size - offset);
  const buf = Buffer.alloc(need);
  fs.readSync(fd, buf, 0, need, offset);
  const data = Buffer.concat([prev, buf]);
  const text = data.toString("latin1");
  let m;
  keyRe.lastIndex = 0;
  while ((m = keyRe.exec(text)) !== null) encyKeys.add(m[1]);
  pathRe.lastIndex = 0;
  while ((m = pathRe.exec(text)) !== null) pathKeys.add(m[0]);
  prev = data.subarray(Math.max(0, data.length - overlap));
  offset += need;
  if (offset / st.size > 0 && offset % (64 * 1024 * 1024) < chunkSize) {
    // progress
  }
}
fs.closeSync(fd);
console.log("Ency_ keys found", encyKeys.size);
console.log([...encyKeys].sort().slice(0, 80).join(", "));
console.log("path keys", pathKeys.size, [...pathKeys].sort().slice(0, 40).join(" | "));

// Also search for PDAEncyclopedia Entry keys in assets as "key": "Peeper" patterns near encyclopedia
const sampleKeys = ["Peeper", "Gasopod", "Aurora", "Creepvine", "Seamoth", "ReaperLeviathan"];
for (const k of sampleKeys) {
  const b = Buffer.from(k);
  // count in scene
  let c = 0;
  for (let i = 0; i < scene.length - b.length; i++) if (scene.compare(b, 0, b.length, i, i + b.length) === 0) c++;
  console.log("scene count", k, c);
}
