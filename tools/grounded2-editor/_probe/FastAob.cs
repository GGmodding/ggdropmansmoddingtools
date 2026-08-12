using System;
using System.Collections.Generic;
using System.IO;
public class Aob {
  public static int[] Find(byte[] data, string pat, int maxHits) {
    var parts = pat.Split(new[]{' '}, StringSplitOptions.RemoveEmptyEntries);
    var need = new byte?[parts.Length];
    for (int i=0;i<parts.Length;i++) need[i] = parts[i]=="??" ? (byte?)null : Convert.ToByte(parts[i],16);
    // first anchored non-wildcard for speed
    int anchor=-1; byte aval=0;
    for (int i=0;i<need.Length;i++) if (need[i].HasValue) { anchor=i; aval=need[i].Value; break; }
    var hits = new List<int>();
    int last = data.Length - need.Length;
    for (int i=0;i<=last;i++) {
      if (anchor>=0 && data[i+anchor]!=aval) continue;
      bool ok=true;
      for (int j=0;j<need.Length;j++) {
        if (need[j].HasValue && data[i+j]!=need[j].Value) { ok=false; break; }
      }
      if (ok) { hits.Add(i); if (hits.Count>=maxHits) break; }
    }
    return hits.ToArray();
  }
  public static void Main(string[] args) {
    var data = File.ReadAllBytes(args[0]);
    Console.WriteLine("size="+data.Length);
    var pats = new Dictionary<string,string>{
      {"Statistics","4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4"},
      {"GNames","48 8D 0D ?? ?? ?? ?? E8 ?? ?? FE FF 4C 8B C0 C6 05 ?? ?? ?? ?? 01"},
      {"GObjects","4C 8B 0D ?? ?? ?? ?? 41 3B C0 7D 17"},
      {"GWorld","48 8B 1D ?? ?? ?? ?? 48 85 DB 74 11 48 8B 1B"},
      {"GWorld2","48 8B 1D ?? ?? ?? ?? 48 85 DB 74 ?? 48 8B"},
      {"Player","4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 40 01 00 00 48 89 9C 24 A0 00 00 00 48 85 C0"},
      {"GearData","48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 C0 00 00 00 44 88 A7 C0"},
      {"EngineData","48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 F8 0A 00 00 48 85 C9 74 07 48 8B"},
      {"GameState","48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 80 02 00 00 74 11"},
      // broader UE-ish
      {"GWorld_loose","48 8B 1D ?? ?? ?? ?? 48 85 DB 74"},
      {"GNames_lea","48 8D 0D ?? ?? ?? ?? E8 ?? ?? ?? FF"},
      {"GObj_mov","4C 8B 0D ?? ?? ?? ?? 4C 8B"},
    };
    foreach (var kv in pats) {
      var h = Find(data, kv.Value, 5);
      Console.WriteLine(kv.Key+" hits="+h.Length+(h.Length>0?" offs="+string.Join(",",h):""));
    }
  }
}
