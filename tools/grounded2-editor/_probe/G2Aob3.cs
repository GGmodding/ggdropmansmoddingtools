using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class G2Aob3 {
  static bool Match(byte[] hay, long i, byte[] n, bool[] m) {
    for (int j=0;j<n.Length;j++) if (m[j] && hay[i+j]!=n[j]) return false;
    return true;
  }
  static void Parse(string p, out byte[] b, out bool[] m) {
    var t=p.Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries);
    b=new byte[t.Length]; m=new bool[t.Length];
    for(int i=0;i<t.Length;i++){ if(t[i]=="??"){m[i]=false;b[i]=0;} else {m[i]=true;b[i]=Convert.ToByte(t[i],16);} }
  }
  static List<long> Scan(byte[] hay, string pattern, int max) {
    byte[] n; bool[] m; Parse(pattern,out n,out m);
    var hits=new List<long>();
    int anchor=-1; byte av=0;
    for(int j=0;j<n.Length;j++) if(m[j]){anchor=j;av=n[j];break;}
    long lim=hay.LongLength-n.Length;
    for(long i=0;i<=lim;i++){
      if(hay[i+anchor]!=av) continue;
      if(!Match(hay,i,n,m)) continue;
      hits.Add(i); if(hits.Count>=max) break;
    }
    return hits;
  }
  static uint SecDelta(byte[] data, long fileOff) {
    int pe = BitConverter.ToInt32(data, 0x3C);
    int num = BitConverter.ToUInt16(data, pe+6);
    int sizeOpt = BitConverter.ToUInt16(data, pe+20);
    int sec0 = pe + 24 + sizeOpt;
    for(int i=0;i<num;i++){
      int off = sec0 + i*40;
      uint va = BitConverter.ToUInt32(data, off+12);
      uint raw = BitConverter.ToUInt32(data, off+20);
      uint rsz = BitConverter.ToUInt32(data, off+16);
      if(fileOff >= raw && fileOff < raw + rsz) return va - raw;
    }
    return 0;
  }
  static void Show(byte[] hay, long h, string name) {
    uint d = SecDelta(hay, h);
    long rva = h + d;
    int rel = BitConverter.ToInt32(hay, (int)(h+3));
    long tgtRva = rva + 7 + rel;
    var sb=new StringBuilder();
    for(int k=0;k<40;k++) sb.Append(hay[h+k].ToString("X2")).Append(' ');
    Console.WriteLine(string.Format("{0} file=0x{1:X} rva=0x{2:X} staticRVA=0x{3:X}\n  {4}", name, h, rva, tgtRva, sb));
  }

  public static void Main(string[] args) {
    byte[] hay = File.ReadAllBytes(args[0]);
    Console.WriteLine("size="+hay.Length);

    // GSpots-style GWorld variants (as CE AOB strings)
    var pats = new Dictionary<string,string>{
      {"GW1","48 89 05 ?? ?? ?? ?? ?? 8B ?? ?? ?? F6 86 3B 01 00 00 40"},
      {"GW2","48 89 05 ?? ?? ?? ?? ?? 8B ?? ?? F6 86 3B 01 00 00 40"},
      {"GW3","48 89 05 ?? ?? ?? ?? ?? 8B ?? ?? ?? ?? ?? F6 86 ?? 01 00 00 40"},
      {"GW5","48 89 05 ?? ?? ?? ?? 48 8B 8F A0 00 00 00"},
      {"GW6","48 89 05 ?? ?? ?? ?? 49 8B ?? 78 F6 ?? 3B 01 00 00 40"},
      {"GW8","48 89 05 ?? ?? ?? ?? ?? 8B ?? 88 ?? ?? ?? F6 ?? 0B 01 00 00 40 75 ??"},
      {"GN1","48 8D 0D ?? ?? ?? ?? E8 ?? ?? FE FF 4C 8B C0 C6 05 ?? ?? ?? ?? 01"},
      {"GN3","48 8D 0D ?? ?? ?? ?? E8 ?? ?? FF FF 48 8B D0 C6 05 ?? ?? ?? ?? 01"},
      {"GN4","48 8B 05 ?? ?? ?? ?? 48 85 C0 75 5F B9 08 08 00"},
      {"GO1","4C 8B 0D ?? ?? ?? ?? 99 0F B7 D2"},
      {"GO2","4C 8B 0D ?? ?? ?? ?? 41 3B C0 7D 17"},
      {"GO5","4C 8B 0D ?? ?? ?? ?? 8B D0 C1 EA 10"},
      {"Stats","4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4"},
      // Broader player candidates
      {"P_48","48 8B 05 ?? ?? ?? ?? 48 85 C0 0F 84 ?? ?? ?? ?? 48 8B 80 ?? 01 00 00"},
      {"P_4C2","4C 8B 05 ?? ?? ?? ?? 4D 85 C0 74 ?? 49 8B 80 ?? 01 00 00"},
      {"P_4C3","4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 41 8B"},
      {"P_gi","48 8B 05 ?? ?? ?? ?? 48 85 C0 74 ?? 48 8B 88 38 00 00 00"},
      // GameState-ish: cmp [rcx+???], then short jz - try common new offsets
      {"GS_2A0","48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 A0 02 00 00"},
      {"GS_300","48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 00 03 00 00"},
      {"GS_any","48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A"},
      // Engine: UEngine / GameViewport path
      {"EN_any","48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88"},
      {"EN_B00","48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 00 0B 00 00"},
      {"EN_B08","48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 08 0B 00 00"},
      {"EN_C00","48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 00 0C 00 00"},
      // Gear
      {"GE_any","48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B"},
    };

    foreach(var kv in pats){
      var hits=Scan(hay, kv.Value, 6);
      Console.WriteLine("\n"+kv.Key+" hits="+hits.Count+"  "+kv.Value);
      foreach(var h in hits) Show(hay,h,kv.Key);
    }
  }
}
