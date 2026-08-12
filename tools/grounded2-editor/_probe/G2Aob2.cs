using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class G2Aob2 {
  static List<long> ScanExact(byte[] hay, byte[] needle, int maxHits) {
    var hits = new List<long>();
    int n = needle.Length;
    // first-byte filter
    byte a = needle[0];
    long lim = hay.LongLength - n;
    for (long i = 0; i <= lim; i++) {
      if (hay[i] != a) continue;
      bool ok = true;
      for (int j = 1; j < n; j++) if (hay[i+j] != needle[j]) { ok = false; break; }
      if (!ok) continue;
      hits.Add(i);
      if (hits.Count >= maxHits) break;
    }
    return hits;
  }

  static byte[] H(string s) {
    var t = s.Split(new[]{' '}, StringSplitOptions.RemoveEmptyEntries);
    var b = new byte[t.Length];
    for (int i=0;i<t.Length;i++) b[i]=Convert.ToByte(t[i],16);
    return b;
  }

  static void Dump(byte[] hay, long at, int before, int after, string tag) {
    long start = Math.Max(0, at - before);
    long end = Math.Min(hay.Length, at + after);
    var sb = new StringBuilder();
    sb.Append(tag).Append(" @0x").Append(at.ToString("X")).Append("\n");
    for (long i = start; i < end; i++) {
      if ((i - start) % 16 == 0) sb.Append(string.Format("\n  {0:X8}: ", i));
      sb.Append(hay[i].ToString("X2")).Append(i == at ? '*' : ' ');
    }
    // Also try find nearby rip-relative mov
    for (long i = Math.Max(0, at - 64); i < Math.Min(hay.Length - 7, at + 16); i++) {
      if ((hay[i] == 0x48 || hay[i] == 0x4C) && hay[i+1] == 0x8B &&
          (hay[i+2] == 0x05 || hay[i+2] == 0x0D || hay[i+2] == 0x15 || hay[i+2] == 0x1D || hay[i+2] == 0x35)) {
        int rel = BitConverter.ToInt32(hay, (int)(i + 3));
        long tgt = i + 7 + rel;
        sb.Append(string.Format("\n  rip-mov @0x{0:X} -> 0x{1:X}", i, tgt));
      }
    }
    Console.WriteLine(sb.ToString());
  }

  public static void Main(string[] args) {
    byte[] hay = File.ReadAllBytes(args[0]);
    Console.WriteLine("loaded " + hay.Length);

    var needles = new Dictionary<string,string> {
      {"mov_r8_140", "49 8B 80 40 01 00 00"},
      {"mov_rax_140", "48 8B 80 40 01 00 00"},
      {"mov_rcx_140", "48 8B 81 40 01 00 00"},
      {"gear_tail", "44 88 A7 C0"},
      {"gear_store", "48 89 3C D8"},
      {"eng_AF8", "48 8B 88 F8 0A 00 00"},
      {"eng_AF8_alt", "48 8B 80 F8 0A 00 00"},
      {"gs_280", "48 39 81 80 02 00 00"},
      {"gs_280_alt", "48 39 80 80 02 00 00"},
      {"gs_tail", "45 33 C0 48 8B 0A 48 39 81"},
      {"stack_A0", "48 89 9C 24 A0 00 00 00"},
      {"stack_C0", "48 8B 9C 24 C0 00 00 00"},
      {"localplayers_38", "48 8B 40 38"},
      // UWorld* PersistentLevel / GameState common
      {"GameState_cmp", "80 02 00 00 74 11"},
    };

    foreach (var kv in needles) {
      var hits = ScanExact(hay, H(kv.Value), 12);
      Console.WriteLine("\n=== " + kv.Key + " hits=" + hits.Count + " pattern=" + kv.Value);
      int shown = 0;
      foreach (var h in hits) {
        Dump(hay, h, 24, 40, kv.Key);
        if (++shown >= 4) break;
      }
    }
  }
}
