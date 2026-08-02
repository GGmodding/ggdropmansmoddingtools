const fs = require("fs");

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

// Dump after Player payload
function findPlayer() {
  const sig = Buffer.from([0x0a, 0x06, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72, 0x10, 0x01, 0xd2]);
  const at = scene.indexOf(sig);
  const [len, ps] = readVarint(scene, at + 11);
  const pe = ps + len;
  console.log("Player payload", len, "ends", pe);
  console.log("after payload hex", scene.subarray(pe, pe + 120).toString("hex"));
  let a = "";
  for (const b of scene.subarray(pe, pe + 120)) a += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
  console.log("after ascii", a);

  // Parse ANY length-delimited / varint fields after payload until next 0a Name
  let i = pe;
  const extra = [];
  while (i < pe + 2000) {
    const tag = scene[i];
    const field = tag >> 3,
      wt = tag & 7;
    if (field === 0 || field > 500) break;
    // stop if looks like new component: 0a <len> Name
    if (tag === 0x0a) {
      const [nlen, ni] = readVarint(scene, i + 1);
      if (nlen >= 3 && nlen <= 60) {
        const name = scene.subarray(ni, ni + nlen).toString("utf8");
        if (/^[A-Za-z][A-Za-z0-9_.$]*$/.test(name)) {
          console.log("next component", name, "at", i);
          break;
        }
      }
    }
    i++;
    if (wt === 0) {
      const [v, ni] = readVarint(scene, i);
      extra.push(`f${field}:v=${v}`);
      i = ni;
    } else if (wt === 2) {
      const [len, ni] = readVarint(scene, i);
      i = ni;
      const slice = scene.subarray(i, i + len);
      i += len;
      let printable = 0;
      for (const b of slice) if (b >= 32 && b <= 126) printable++;
      const str =
        slice.length && printable / slice.length > 0.85 ? slice.toString("utf8") : null;
      extra.push(str ? `f${field}:str=${str}` : `f${field}:len=${len}`);
    } else if (wt === 5) {
      extra.push(`f${field}:f32`);
      i += 4;
    } else if (wt === 1) {
      extra.push(`f${field}:f64`);
      i += 8;
    } else break;
  }
  console.log("extra fields after player blob", extra);
}
findPlayer();

// ---- CLI: get field signatures for Player.encyclopedia etc ----
function parseMeta(buf) {
  const e_lfanew = buf.readUInt32LE(0x3c);
  const coff = e_lfanew + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const isPE32Plus = buf.readUInt16LE(opt) === 0x20b;
  const dataDirOff = opt + (isPE32Plus ? 112 : 96);
  const cliRva = buf.readUInt32LE(dataDirOff + 14 * 8);
  const sections = [];
  const secStart = opt + optSize;
  for (let i = 0; i < numSections; i++) {
    const o = secStart + i * 40;
    sections.push({
      va: buf.readUInt32LE(o + 12),
      vsize: buf.readUInt32LE(o + 8),
      rawSize: buf.readUInt32LE(o + 16),
      rawPtr: buf.readUInt32LE(o + 20),
    });
  }
  const rvaToOff = (rva) => {
    for (const s of sections) {
      if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize))
        return s.rawPtr + (rva - s.va);
    }
    return -1;
  };
  const cliOff = rvaToOff(cliRva);
  const metaOff = rvaToOff(buf.readUInt32LE(cliOff + 8));
  const verLen = buf.readUInt32LE(metaOff + 12);
  const verPad = (verLen + 3) & ~3;
  let nStreams = buf.readUInt16LE(metaOff + 16 + verPad + 2);
  let p = metaOff + 16 + verPad + 4;
  const streams = {};
  for (let i = 0; i < nStreams; i++) {
    const off = buf.readUInt32LE(p);
    const size = buf.readUInt32LE(p + 4);
    let name = "",
      q = p + 8;
    while (buf[q]) name += String.fromCharCode(buf[q++]);
    q++;
    while ((q - (p + 8)) % 4) q++;
    streams[name] = { off: metaOff + off, size };
    p = q;
  }
  const strHeap = streams["#Strings"];
  const blobHeap = streams["#Blob"];
  const getStr = (idx) => {
    let i = strHeap.off + idx,
      s = "";
    while (buf[i]) s += String.fromCharCode(buf[i++]);
    return s;
  };
  const heapSizes = buf[streams["#~"].off + 6];
  const stringIdxSize = heapSizes & 1 ? 4 : 2;
  const guidIdxSize = heapSizes & 2 ? 4 : 2;
  const blobIdxSize = heapSizes & 4 ? 4 : 2;
  const valid = buf.readBigUInt64LE(streams["#~"].off + 8);
  let rcOff = streams["#~"].off + 24;
  const rowCounts = {};
  for (let bit = 0; bit < 64; bit++) {
    if ((valid >> BigInt(bit)) & 1n) {
      rowCounts[bit] = buf.readUInt32LE(rcOff);
      rcOff += 4;
    }
  }
  const readIdx = (off, size) => (size === 4 ? buf.readUInt32LE(off) : buf.readUInt16LE(off));
  const codedSize = (tagBits, tables) => {
    let m = 0;
    for (const t of tables) m = Math.max(m, rowCounts[t] || 0);
    return m < 1 << (16 - tagBits) ? 2 : 4;
  };
  const T = {
    TypeRef: 1,
    TypeDef: 2,
    Field: 4,
    MethodDef: 6,
    Param: 8,
    TypeSpec: 27,
    Module: 0,
    ModuleRef: 26,
    AssemblyRef: 35,
    MemberRef: 10,
    Property: 23,
    Event: 20,
    StandAloneSig: 17,
    Assembly: 32,
    InterfaceImpl: 9,
    GenericParam: 42,
    GenericParamConstraint: 44,
    MethodSpec: 43,
    File: 38,
    ExportedType: 39,
    ManifestResource: 40,
    DeclSecurity: 14,
  };
  const TypeDefOrRefSize = codedSize(2, [T.TypeDef, T.TypeRef, T.TypeSpec]);
  const ResolutionScopeSize = codedSize(2, [T.Module, T.ModuleRef, T.AssemblyRef, T.TypeRef]);
  const MemberRefParentSize = codedSize(3, [
    T.TypeDef,
    T.TypeRef,
    T.ModuleRef,
    T.MethodDef,
    T.TypeSpec,
  ]);
  const CustomAttributeTypeSize = codedSize(3, [T.MethodDef, T.MemberRef]);
  // HasCustomAttribute - large
  const HasCustomAttributeSize = codedSize(5, [
    T.MethodDef,
    T.Field,
    T.TypeRef,
    T.TypeDef,
    T.Param,
    T.InterfaceImpl,
    T.MemberRef,
    T.Module,
    T.DeclSecurity,
    T.Property,
    T.Event,
    T.StandAloneSig,
    T.ModuleRef,
    T.TypeSpec,
    T.Assembly,
    T.AssemblyRef,
    T.File,
    T.ExportedType,
    T.ManifestResource,
    T.GenericParam,
    T.GenericParamConstraint,
    T.MethodSpec,
  ]);
  const fieldIdxSize = (rowCounts[T.Field] || 0) < 65536 ? 2 : 4;
  const methodIdxSize = (rowCounts[T.MethodDef] || 0) < 65536 ? 2 : 4;
  const paramIdxSize = (rowCounts[T.Param] || 0) < 65536 ? 2 : 4;
  const typeDefIdxSize = (rowCounts[T.TypeDef] || 0) < 65536 ? 2 : 4;
  const HasConstantSize = codedSize(2, [T.Field, T.Param, T.Property]);

  const rowSize = {};
  rowSize[0] = 2 + stringIdxSize + guidIdxSize * 3; // Module
  rowSize[1] = ResolutionScopeSize + stringIdxSize * 2; // TypeRef
  rowSize[2] = 4 + stringIdxSize * 2 + TypeDefOrRefSize + fieldIdxSize + methodIdxSize;
  rowSize[4] = 2 + stringIdxSize + blobIdxSize;
  rowSize[6] = 4 + 2 + 2 + stringIdxSize + blobIdxSize + paramIdxSize;
  rowSize[8] = 2 + 2 + stringIdxSize;
  rowSize[9] = typeDefIdxSize + TypeDefOrRefSize;
  rowSize[10] = MemberRefParentSize + stringIdxSize + blobIdxSize;
  rowSize[11] = 2 + 1 + 1 + HasConstantSize + blobIdxSize; // Constant: type(1)+padding(1)?
  // ECMA: Constant: Type(1) Padding(1) Parent(coded) Value(blob)
  rowSize[11] = 2 + HasConstantSize + blobIdxSize;
  rowSize[12] = HasCustomAttributeSize + CustomAttributeTypeSize + blobIdxSize;
  // continue with zeros for unknown - we'll only need TypeDef/Field/TypeRef/CustomAttribute/MemberRef

  // Better: compute sizes for all tables we need by using known formulas for common ones and skip-scan for CustomAttribute
  const tableOff = {};
  let tableData = rcOff;
  // We need accurate sizes for tables 0..12 at least
  const HasFieldMarshalSize = codedSize(1, [T.Field, T.Param]);
  const HasDeclSecuritySize = codedSize(2, [T.TypeDef, T.MethodDef, T.Assembly]);
  const HasSemanticsSize = codedSize(1, [T.Event, T.Property]);
  const MethodDefOrRefSize = codedSize(1, [T.MethodDef, T.MemberRef]);
  const MemberForwardedSize = codedSize(1, [T.Field, T.MethodDef]);
  const ImplementationSize = codedSize(2, [T.File, T.AssemblyRef, T.ExportedType]);
  const TypeOrMethodDefSize = codedSize(1, [T.TypeDef, T.MethodDef]);
  const eventIdxSize = (rowCounts[20] || 0) < 65536 ? 2 : 4;
  const propertyIdxSize = (rowCounts[23] || 0) < 65536 ? 2 : 4;
  const assemblyRefIdxSize = (rowCounts[35] || 0) < 65536 ? 2 : 4;
  const fileIdxSize = (rowCounts[38] || 0) < 65536 ? 2 : 4;
  const exportedTypeIdxSize = (rowCounts[39] || 0) < 65536 ? 2 : 4;
  const genericParamIdxSize = (rowCounts[42] || 0) < 65536 ? 2 : 4;

  rowSize[13] = HasFieldMarshalSize + blobIdxSize; // FieldMarshal
  rowSize[14] = 2 + HasDeclSecuritySize + blobIdxSize; // DeclSecurity
  rowSize[15] = 2 + 4 + typeDefIdxSize; // ClassLayout PackingSize(2) ClassSize(4) Parent
  rowSize[16] = 4 + fieldIdxSize; // FieldLayout
  rowSize[17] = blobIdxSize; // StandAloneSig
  rowSize[18] = typeDefIdxSize + eventIdxSize; // EventMap
  rowSize[20] = 2 + stringIdxSize + TypeDefOrRefSize; // Event
  rowSize[21] = typeDefIdxSize + propertyIdxSize; // PropertyMap
  rowSize[23] = 2 + stringIdxSize + blobIdxSize; // Property
  rowSize[24] = 2 + methodIdxSize + HasSemanticsSize; // MethodSemantics
  rowSize[25] = typeDefIdxSize + MethodDefOrRefSize + MethodDefOrRefSize; // MethodImpl
  rowSize[26] = stringIdxSize; // ModuleRef
  rowSize[27] = blobIdxSize; // TypeSpec
  rowSize[28] = 2 + MemberForwardedSize + stringIdxSize + (rowCounts[26] < 65536 ? 2 : 4); // ImplMap
  rowSize[29] = 4 + fieldIdxSize; // FieldRVA
  rowSize[32] = 4 + 8 + 4 + blobIdxSize + stringIdxSize + stringIdxSize; // Assembly rough
  // Assembly: HashAlgId(4) Major(2) Minor(2) Build(2) Rev(2) Flags(4) PublicKey(blob) Name(string) Culture(string)
  rowSize[32] = 4 + 2 * 4 + 4 + blobIdxSize + stringIdxSize + stringIdxSize;
  rowSize[35] =
    2 * 4 + 4 + blobIdxSize + stringIdxSize + stringIdxSize + blobIdxSize; // AssemblyRef
  // AssemblyRef: Major Minor Build Rev (2*4) Flags(4) PublicKeyOrToken(blob) Name Culture HashValue
  rowSize[38] = 4 + stringIdxSize + blobIdxSize; // File
  rowSize[39] =
    4 + stringIdxSize + stringIdxSize + ImplementationSize; // ExportedType
  rowSize[40] = 4 + 4 + stringIdxSize + ImplementationSize; // ManifestResource
  rowSize[41] = typeDefIdxSize + typeDefIdxSize; // NestedClass
  rowSize[42] = 2 + 2 + stringIdxSize + TypeOrMethodDefSize; // GenericParam
  rowSize[43] = MethodDefOrRefSize + blobIdxSize; // MethodSpec
  rowSize[44] = genericParamIdxSize + TypeDefOrRefSize; // GenericParamConstraint

  for (let bit = 0; bit < 64; bit++) {
    if ((valid >> BigInt(bit)) & 1n) {
      tableOff[bit] = tableData;
      const rs = rowSize[bit];
      const rc = rowCounts[bit] || 0;
      if (!rs && rc) {
        console.log("MISSING row size for table", bit, "rows", rc);
      }
      tableData += (rs || 0) * rc;
    }
  }

  // TypeRefs for resolving signatures
  const typeRefs = [];
  {
    const off = tableOff[1];
    const rs = rowSize[1];
    for (let i = 0; i < (rowCounts[1] || 0); i++) {
      const o = off + i * rs;
      let q = o + ResolutionScopeSize;
      const name = getStr(readIdx(q, stringIdxSize));
      q += stringIdxSize;
      const ns = getStr(readIdx(q, stringIdxSize));
      typeRefs.push({ name, ns });
    }
  }

  const types = [];
  {
    const off = tableOff[2];
    const rs = rowSize[2];
    for (let i = 0; i < (rowCounts[2] || 0); i++) {
      const o = off + i * rs;
      let q = o + 4;
      const name = getStr(readIdx(q, stringIdxSize));
      q += stringIdxSize;
      const ns = getStr(readIdx(q, stringIdxSize));
      q += stringIdxSize + TypeDefOrRefSize;
      const fieldList = readIdx(q, fieldIdxSize);
      q += fieldIdxSize;
      const methodList = readIdx(q, methodIdxSize);
      types.push({ i: i + 1, name, ns, fieldList, methodList });
    }
    for (let i = 0; i < types.length; i++) {
      types[i].fieldListEnd =
        i + 1 < types.length ? types[i + 1].fieldList : (rowCounts[4] || 0) + 1;
      types[i].methodListEnd =
        i + 1 < types.length ? types[i + 1].methodList : (rowCounts[6] || 0) + 1;
    }
  }

  function decodeTypeDefOrRef(coded) {
    const tag = coded & 3;
    const idx = coded >> 2;
    if (tag === 0) {
      const t = types[idx - 1];
      return t ? `${t.ns}.${t.name}` : `TypeDef#${idx}`;
    }
    if (tag === 1) {
      const t = typeRefs[idx - 1];
      return t ? `${t.ns}.${t.name}` : `TypeRef#${idx}`;
    }
    return `TypeSpec#${idx}`;
  }

  function decodeBlobSig(blobIdx) {
    // Field sig: 0x06 <CustomMod*> Type
    let i = blobHeap.off + blobIdx;
    let len = buf[i];
    let hdr = 1;
    if (len & 0x80) {
      if ((len & 0xc0) === 0x80) {
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
    }
    const data = buf.subarray(i + hdr, i + hdr + len);
    let p = 0;
    const prolog = data[p++];
    function decodeType() {
      const t = data[p++];
      const ELEMENT = {
        0x01: "void",
        0x02: "bool",
        0x03: "char",
        0x04: "i1",
        0x05: "u1",
        0x06: "i2",
        0x07: "u2",
        0x08: "i4",
        0x09: "u4",
        0x0a: "i8",
        0x0b: "u8",
        0x0c: "r4",
        0x0d: "r8",
        0x0e: "string",
        0x0f: "ptr",
        0x10: "byref",
        0x11: "valuetype",
        0x12: "class",
        0x13: "var",
        0x14: "array",
        0x15: "genericinst",
        0x16: "typedbyref",
        0x18: "i",
        0x19: "u",
        0x1b: "fnptr",
        0x1c: "object",
        0x1d: "szarray",
        0x1e: "mvar",
        0x1f: "cmod_reqd",
        0x20: "cmod_opt",
      };
      if (t === 0x12 || t === 0x11) {
        // compressed TypeDefOrRef
        let coded = data[p];
        if ((coded & 0x80) === 0) {
          p++;
        } else if ((coded & 0xc0) === 0x80) {
          coded = ((coded & 0x3f) << 8) | data[p + 1];
          p += 2;
        } else {
          coded =
            ((coded & 0x1f) << 24) |
            (data[p + 1] << 16) |
            (data[p + 2] << 8) |
            data[p + 3];
          p += 4;
        }
        return `${ELEMENT[t] || t} ${decodeTypeDefOrRef(coded)}`;
      }
      if (t === 0x1d) return decodeType() + "[]";
      if (t === 0x15) {
        // genericinst CLASS/VALUETYPE Type TypeArgCount Types
        const gen = decodeType();
        let count = data[p++];
        const args = [];
        for (let k = 0; k < count; k++) args.push(decodeType());
        return `${gen}<${args.join(",")}>`;
      }
      return ELEMENT[t] || "0x" + t.toString(16);
    }
    try {
      if (prolog !== 0x06) return `prolog=0x${prolog.toString(16)}`;
      return decodeType();
    } catch (e) {
      return "err:" + e.message;
    }
  }

  function fieldsOf(typeName) {
    const t = types.find((x) => x.name === typeName);
    if (!t) return null;
    const off = tableOff[4];
    const rs = rowSize[4];
    const out = [];
    for (let fi = t.fieldList; fi < t.fieldListEnd; fi++) {
      const o = off + (fi - 1) * rs;
      const flags = buf.readUInt16LE(o);
      const name = getStr(readIdx(o + 2, stringIdxSize));
      const sig = readIdx(o + 2 + stringIdxSize, blobIdxSize);
      out.push({ fi, flags, name, sig: decodeBlobSig(sig), rawSig: sig });
    }
    return out;
  }

  // Nested classes
  console.log("\nNestedClass rows", rowCounts[41]);
  if (tableOff[41]) {
    const off = tableOff[41];
    const rs = rowSize[41];
    for (let i = 0; i < (rowCounts[41] || 0); i++) {
      const o = off + i * rs;
      const nested = readIdx(o, typeDefIdxSize);
      const encl = readIdx(o + typeDefIdxSize, typeDefIdxSize);
      const n = types[nested - 1];
      const e = types[encl - 1];
      if (e && /PDAEncyclopedia|PDALog|PDAScanner|KnownTech|^Player$/.test(e.name)) {
        console.log(`Nested ${e.name} / ${n.name}`);
        const fields = fieldsOf(n.name);
        // fieldsOf finds first match - need by index
        const offF = tableOff[4];
        const rsF = rowSize[4];
        const fl = [];
        for (let fi = n.fieldList; fi < n.fieldListEnd; fi++) {
          const fo = offF + (fi - 1) * rsF;
          const name = getStr(readIdx(fo + 2, stringIdxSize));
          const sig = readIdx(fo + 2 + stringIdxSize, blobIdxSize);
          fl.push(`${name}: ${decodeBlobSig(sig)}`);
        }
        console.log(" ", fl.join(" | "));
      }
    }
  }

  const playerFields = fieldsOf("Player");
  const want = [
    "version",
    "serializedIsUnderwater",
    "serializedDepthClass",
    "serializedEscapePod",
    "knownTech",
    "currentSubUID",
    "journal",
    "encyclopedia",
    "scanner",
    "analyzedTech",
    "usedTools",
    "notifications",
    "pins",
    "timeCapsules",
    "currentVersion",
  ];
  console.log("\nPlayer key field types:");
  for (const f of playerFields) {
    if (want.includes(f.name)) console.log(`  ${f.name}: ${f.sig} flags=0x${f.flags.toString(16)}`);
  }

  for (const tn of ["PDAEncyclopedia", "PDALog", "PDAScanner", "KnownTech", "PDAData"]) {
    console.log(`\n${tn} fields:`);
    for (const f of fieldsOf(tn) || []) {
      console.log(`  ${f.name}: ${f.sig}`);
    }
  }

  // Custom attributes on Player fields named encyclopedia/journal/scanner/knownTech - find ProtoMember tag
  // Scan MemberRef for .ctor of ProtoMemberAttribute
  const memberRefs = [];
  {
    const off = tableOff[10];
    const rs = rowSize[10];
    for (let i = 0; i < (rowCounts[10] || 0); i++) {
      const o = off + i * rs;
      let q = o;
      // skip parent
      q += MemberRefParentSize;
      const name = getStr(readIdx(q, stringIdxSize));
      memberRefs.push({ i: i + 1, name });
    }
  }
  const protoCtor = memberRefs.filter((m) => m.name === ".ctor");
  console.log("\nMemberRef .ctor count", protoCtor.length);

  // Walk CustomAttribute table; parent coded index for Field = tag 1
  const caOff = tableOff[12];
  const caRs = rowSize[12];
  const caRows = rowCounts[12] || 0;
  console.log("CustomAttribute rows", caRows, "rowSize", caRs);

  // Map field index -> name for Player fields
  const player = types.find((t) => t.name === "Player");
  const fieldNames = {};
  {
    const off = tableOff[4];
    const rs = rowSize[4];
    for (let fi = player.fieldList; fi < player.fieldListEnd; fi++) {
      const o = off + (fi - 1) * rs;
      fieldNames[fi] = getStr(readIdx(o + 2, stringIdxSize));
    }
  }

  // Also PDAEncyclopedia Entry fields etc - gather all Field parents
  const interestFieldIdx = new Set(Object.keys(fieldNames).map(Number));
  // add encyclopedia nested later

  let protoHits = 0;
  for (let i = 0; i < caRows; i++) {
    const o = caOff + i * caRs;
    const parent = readIdx(o, HasCustomAttributeSize);
    const type = readIdx(o + HasCustomAttributeSize, CustomAttributeTypeSize);
    const value = readIdx(
      o + HasCustomAttributeSize + CustomAttributeTypeSize,
      blobIdxSize
    );
    const parentTag = parent & 0x1f; // 5 bits
    const parentIdx = parent >> 5;
    if (parentTag !== 1) continue; // Field
    if (!interestFieldIdx.has(parentIdx) && parentIdx < player.fieldList) continue;
    // decode blob: prolog 0x0001, then packed int32 tag for ProtoMember(int)
    const bi = blobHeap.off + value;
    let blen = buf[bi],
      bhdr = 1;
    if (blen & 0x80) {
      if ((blen & 0xc0) === 0x80) {
        blen = ((blen & 0x3f) << 8) | buf[bi + 1];
        bhdr = 2;
      } else {
        blen =
          ((blen & 0x1f) << 24) |
          (buf[bi + 1] << 16) |
          (buf[bi + 2] << 8) |
          buf[bi + 3];
        bhdr = 4;
      }
    }
    const blob = buf.subarray(bi + bhdr, bi + bhdr + blen);
    // ProtoMemberAttribute ctor(int tag) blob: 01 00 <int32 LE> then named args
    if (blob.length >= 6 && blob[0] === 0x01 && blob[1] === 0x00) {
      const tag = blob.readInt32LE(2);
      const fname = fieldNames[parentIdx];
      if (fname && want.includes(fname)) {
        console.log(`ProtoMember? Player.${fname} => tag ${tag} (blob len ${blen})`);
        protoHits++;
      }
    }
  }
  console.log("protoHits on Player want-fields", protoHits);

  // Broader: any ProtoMember on Player fields
  const allPlayerProto = [];
  for (let i = 0; i < caRows; i++) {
    const o = caOff + i * caRs;
    const parent = readIdx(o, HasCustomAttributeSize);
    const value = readIdx(
      o + HasCustomAttributeSize + CustomAttributeTypeSize,
      blobIdxSize
    );
    const parentTag = parent & 0x1f;
    const parentIdx = parent >> 5;
    if (parentTag !== 1) continue;
    if (parentIdx < player.fieldList || parentIdx >= player.fieldListEnd) continue;
    const bi = blobHeap.off + value;
    let blen = buf[bi],
      bhdr = 1;
    if (blen & 0x80) {
      if ((blen & 0xc0) === 0x80) {
        blen = ((blen & 0x3f) << 8) | buf[bi + 1];
        bhdr = 2;
      } else {
        blen =
          ((blen & 0x1f) << 24) |
          (buf[bi + 1] << 16) |
          (buf[bi + 2] << 8) |
          (buf[bi + 3]);
        bhdr = 4;
      }
    }
    const blob = buf.subarray(bi + bhdr, bi + bhdr + blen);
    if (blob.length >= 6 && blob[0] === 0x01 && blob[1] === 0x00) {
      const tag = blob.readInt32LE(2);
      // Heuristic: ProtoMember tags are small positive ints
      if (tag > 0 && tag < 100) {
        allPlayerProto.push({ field: fieldNames[parentIdx], tag, blen });
      }
    }
  }
  console.log("\nLikely ProtoMember on Player fields:");
  allPlayerProto.sort((a, b) => a.tag - b.tag);
  for (const x of allPlayerProto) console.log(`  [${x.tag}] ${x.field}`);

  return { types, tableOff, rowSize, rowCounts, getStr, blobHeap, buf, stringIdxSize, blobIdxSize, fieldIdxSize };
}

parseMeta(dll);

// Search language files / other assets for Ency_
const langDir =
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data";
function walkFind(dir, re, depth = 0, out = []) {
  if (depth > 3) return out;
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = pathJoin(dir, e.name);
    if (e.isDirectory()) walkFind(p, re, depth + 1, out);
    else if (re.test(e.name)) out.push(p);
  }
  return out;
}
function pathJoin(a, b) {
  return a + "/" + b;
}
const langFiles = walkFind(langDir, /english|Language|Localization|\.resources/i);
console.log("\nlang-like files", langFiles.slice(0, 30));

// Scan StreamingAssets / resources for Ency_ with utf16
const candidates = [
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/resources.assets",
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/sharedassets0.assets",
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/resources.resource",
];
for (const p of candidates) {
  if (!fs.existsSync(p)) {
    console.log("missing", p);
    continue;
  }
  const st = fs.statSync(p);
  console.log("scan", p, st.size);
  const fd = fs.openSync(p, "r");
  const chunk = 8 * 1024 * 1024;
  let found = new Set();
  let off = 0;
  let prev = Buffer.alloc(0);
  while (off < st.size && found.size < 500) {
    const n = Math.min(chunk, st.size - off);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, off);
    const data = Buffer.concat([prev, buf]);
    // ascii Ency_
    for (let i = 0; i < data.length - 6; i++) {
      if (
        data[i] === 0x45 &&
        data[i + 1] === 0x6e &&
        data[i + 2] === 0x63 &&
        data[i + 3] === 0x79 &&
        data[i + 4] === 0x5f
      ) {
        let s = "Ency_";
        let j = i + 5;
        while (j < data.length && data[j] >= 32 && data[j] <= 126 && s.length < 80) {
          s += String.fromCharCode(data[j++]);
        }
        if (s.length > 6) found.add(s);
      }
      // utf16le E n c y _
      if (
        data[i] === 0x45 &&
        data[i + 1] === 0 &&
        data[i + 2] === 0x6e &&
        data[i + 3] === 0 &&
        data[i + 4] === 0x63 &&
        data[i + 5] === 0 &&
        data[i + 6] === 0x79 &&
        data[i + 7] === 0 &&
        data[i + 8] === 0x5f &&
        data[i + 9] === 0
      ) {
        let s = "Ency_";
        let j = i + 10;
        while (j + 1 < data.length && data[j + 1] === 0 && data[j] >= 32 && data[j] <= 126 && s.length < 80) {
          s += String.fromCharCode(data[j]);
          j += 2;
        }
        if (s.length > 6) found.add(s);
      }
    }
    prev = data.subarray(Math.max(0, data.length - 64));
    off += n;
  }
  fs.closeSync(fd);
  console.log("  Ency_ found", found.size, [...found].sort().slice(0, 40));
}
