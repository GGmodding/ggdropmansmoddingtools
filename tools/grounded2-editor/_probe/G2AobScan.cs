using System;
using System.Collections.Generic;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Text;

// Fast multi-pattern AOB scanner for Grounded2Steam-Win64-Shipping.exe
public static class G2Aob {
  static bool Match(byte[] hay, long i, byte[] needle, bool[] mask) {
    for (int j = 0; j < needle.Length; j++) {
      if (!mask[j]) continue;
      if (hay[i + j] != needle[j]) return false;
    }
    return true;
  }

  static void Parse(string pattern, out byte[] bytes, out bool[] mask) {
    var toks = pattern.Split(new[]{' '}, StringSplitOptions.RemoveEmptyEntries);
    bytes = new byte[toks.Length];
    mask = new bool[toks.Length];
    for (int i = 0; i < toks.Length; i++) {
      if (toks[i] == "??" || toks[i] == "?") { mask[i] = false; bytes[i] = 0; }
      else { mask[i] = true; bytes[i] = Convert.ToByte(toks[i], 16); }
    }
  }

  // First-byte index acceleration
  public static List<long> Scan(byte[] hay, string pattern, int maxHits) {
    byte[] needle; bool[] mask;
    Parse(pattern, out needle, out mask);
    var hits = new List<long>();
    int n = needle.Length;
    // pick first fixed byte as anchor
    int anchor = -1; byte aval = 0;
    for (int j = 0; j < n; j++) if (mask[j]) { anchor = j; aval = needle[j]; break; }
    if (anchor < 0) return hits;
    long lim = hay.LongLength - n;
    for (long i = 0; i <= lim; i++) {
      if (hay[i + anchor] != aval) continue;
      if (!Match(hay, i, needle, mask)) continue;
      hits.Add(i);
      if (hits.Count >= maxHits) break;
    }
    return hits;
  }

  public static void Main(string[] args) {
    string path = args[0];
    Console.WriteLine("Loading " + path);
    byte[] hay = File.ReadAllBytes(path);
    Console.WriteLine("Size " + hay.Length);

    var patterns = new Dictionary<string, string[]> {
      {"Player_old", new[]{"4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 40 01 00 00 48 89 9C 24 A0 00 00 00 48 85 C0"}},
      {"Player_v1", new[]{"4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 ?? ?? 00 00 48 89 9C 24 ?? ?? 00 00 48 85 C0"}},
      {"Player_v2", new[]{"4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 ?? 01 00 00"}},
      {"Player_v3", new[]{"4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B"}},
      {"Stats_old", new[]{"4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4"}},
      {"Gear_old", new[]{"48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 C0 00 00 00 44 88 A7 C0"}},
      {"Gear_v1", new[]{"48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 ?? ?? 00 00 44 88 A7"}},
      {"Gear_v2", new[]{"48 8B 05 ?? ?? ?? ?? 48 89 3C D8"}},
      {"Eng_old", new[]{"48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 F8 0A 00 00 48 85 C9 74 07 48 8B"}},
      {"Eng_v1", new[]{"48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 ?? ?? 00 00 48 85 C9 74 07 48 8B"}},
      {"Eng_v2", new[]{"48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 ?? 0A 00 00"}},
      {"GS_old", new[]{"48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 80 02 00 00 74 11"}},
      {"GS_v1", new[]{"48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 ?? ?? 00 00 74"}},
      {"GS_v2", new[]{"48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81"}},
      // Common UE GWorld
      {"GWorld_48", new[]{"48 8B 1D ?? ?? ?? ?? 48 85 DB 74 ?? 48 8B"}},
      {"GWorld_4C", new[]{"4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84"}},
    };

    foreach (var kv in patterns) {
      foreach (var p in kv.Value) {
        var hits = Scan(hay, p, 8);
        Console.WriteLine(kv.Key + " | hits=" + hits.Count + " | " + p);
        foreach (var h in hits) {
          // dump 32 bytes hex
          var sb = new StringBuilder();
          for (int k = 0; k < 48 && h + k < hay.Length; k++) sb.Append(hay[h + k].ToString("X2")).Append(' ');
          // rip resolve for mov reg, [rip+rel32] at +0 if starts with 48/4C 8B 05/1D/35
          long ripTarget = -1;
          if (h + 7 < hay.Length && (hay[h] == 0x48 || hay[h] == 0x4C) && hay[h+1] == 0x8B &&
              (hay[h+2] == 0x05 || hay[h+2] == 0x0D || hay[h+2] == 0x15 || hay[h+2] == 0x1D || hay[h+2] == 0x25 || hay[h+2] == 0x2D || hay[h+2] == 0x35 || hay[h+2] == 0x3D)) {
            int rel = BitConverter.ToInt32(hay, (int)(h + 3));
            ripTarget = h + 7 + rel;
          }
          Console.WriteLine("  @0x" + h.ToString("X") + " rip->0x" + (ripTarget >= 0 ? ripTarget.ToString("X") : "?") + "  " + sb.ToString());
        }
      }
    }
  }
}
