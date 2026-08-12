using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class G2Live {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, long addr, byte[] buf, int size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  const int PROCESS_VM_READ = 0x0010;
  const int PROCESS_QUERY_INFORMATION = 0x0400;

  static IntPtr handle;
  static byte[] buf8 = new byte[8];
  static byte[] buf4 = new byte[4];

  static bool R8(long a, out long v) {
    v = 0; IntPtr n;
    if (!ReadProcessMemory(handle, a, buf8, 8, out n) || n.ToInt32()!=8) return false;
    v = BitConverter.ToInt64(buf8, 0); return true;
  }
  static bool R4(long a, out int v) {
    v = 0; IntPtr n;
    if (!ReadProcessMemory(handle, a, buf4, 4, out n) || n.ToInt32()!=4) return false;
    v = BitConverter.ToInt32(buf4, 0); return true;
  }
  static bool RF(long a, out float v) {
    v = 0; IntPtr n;
    if (!ReadProcessMemory(handle, a, buf4, 4, out n) || n.ToInt32()!=4) return false;
    v = BitConverter.ToSingle(buf4, 0); return true;
  }

  static bool IsHeap(long p) {
    return p > 0x100000000L && p < 0x7FF000000000L;
  }
  static bool LooksObj(long p) {
    long vf;
    return IsHeap(p) && R8(p, out vf) && vf > 0x10000;
  }

  static long ModBase(Process p) {
    foreach (ProcessModule m in p.Modules) {
      if (m.ModuleName.Equals("Grounded2Steam-Win64-Shipping.exe", StringComparison.OrdinalIgnoreCase))
        return m.BaseAddress.ToInt64();
    }
    return p.MainModule.BaseAddress.ToInt64();
  }

  public static void Main() {
    Process[] ps = Process.GetProcessesByName("Grounded2Steam-Win64-Shipping");
    if (ps.Length == 0) { Console.WriteLine("PROCESS_NOT_FOUND"); return; }
    Process proc = ps[0];
    handle = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, proc.Id);
    if (handle == IntPtr.Zero) { Console.WriteLine("OPEN_FAILED"); return; }
    long bas = ModBase(proc);
    Console.WriteLine("pid="+proc.Id+" base="+bas.ToString("X"));

    long[] worldRvas = {0xAD5CE18,0xAD558A0,0xAD574B8,0xAC5BBC8};
    long world=0; long worldRva=0;
    foreach (var rva in worldRvas) {
      long w; if (!R8(bas+rva, out w)) continue;
      // score actors
      int score=0;
      for (long lo=0x28; lo<=0x40; lo+=8) {
        long level; if (!R8(w+lo, out level) || !LooksObj(level)) continue;
        for (long ao=0xC0; ao<=0x120; ao+=8) {
          long data; int num;
          if (!R8(level+ao, out data) || !R4(level+ao+8, out num)) continue;
          if (IsHeap(data) && num>=50 && num<=8000) score += 20;
        }
      }
      Console.WriteLine("worldRva="+rva.ToString("X")+" ptr="+w.ToString("X")+" score="+score);
      if (score>0 && (world==0 || score>=60)) { world=w; worldRva=rva; }
    }
    Console.WriteLine("using world="+world.ToString("X")+" rva="+worldRva.ToString("X"));

    // find local pawn
    long pawn=0;
    for (long lo=0x28; lo<=0x40 && pawn==0; lo+=8) {
      long level; if (!R8(world+lo, out level) || !LooksObj(level)) continue;
      for (long ao=0xC0; ao<=0x120 && pawn==0; ao+=8) {
        long data; int num;
        if (!R8(level+ao, out data) || !R4(level+ao+8, out num)) continue;
        if (!IsHeap(data) || num<50 || num>8000) continue;
        Console.WriteLine("scan actors lo="+lo.ToString("X")+" ao="+ao.ToString("X")+" num="+num);
        for (int i=0;i<num;i++) {
          long actor; if (!R8(data+i*8L, out actor) || !LooksObj(actor)) continue;
          // controller owns + camera
          for (long coff=0x280; coff<=0x360; coff+=8) {
            long ctrl; if (!R8(actor+coff, out ctrl) || !LooksObj(ctrl)) continue;
            bool owns=false;
            for (long poff=0x250; poff<=0x500; poff+=8) {
              long back; if (R8(ctrl+poff, out back) && back==actor) { owns=true; break; }
            }
            if (!owns) continue;
            bool cam=false;
            for (long moff=0x2C0; moff<=0x420; moff+=8) {
              long c; if (R8(ctrl+moff, out c) && LooksObj(c)) { cam=true; break; }
            }
            if (cam) {
              pawn=actor;
              Console.WriteLine("LOCAL pawn="+pawn.ToString("X")+" idx="+i+" ctrlOff="+coff.ToString("X"));
              break;
            }
          }
          if (pawn!=0) break;
        }
      }
    }
    if (pawn==0) { Console.WriteLine("NO_PAWN"); CloseHandle(handle); return; }

    // Find CMC + MaxWalkSpeed-like
    for (long off=0x800; off<=0x1400; off+=8) {
      long c; if (!R8(pawn+off, out c) || !LooksObj(c)) continue;
      for (long f=0x140; f<=0x400; f+=4) {
        float v; if (!RF(c+f, out v)) continue;
        if (v>80 && v<2500) {
          Console.WriteLine("CMC? pawn+"+off.ToString("X")+" float+"+f.ToString("X")+"="+v);
          off=0x9999; break;
        }
      }
    }

    // Deep vitals dump: outer components with health-like pairs + nearby 0-100 meters
    var hits = new List<string>();
    for (long x=0x100; x<=0x500; x+=8) {
      long outer; if (!R8(pawn+x, out outer) || !LooksObj(outer)) continue;
      for (long y=0; y<=0x200; y+=8) {
        long mid; if (!R8(outer+y, out mid) || !LooksObj(mid)) continue;
        // count meters on mid and siblings
        int meters=0;
        for (long f=0x100; f<=0x2C0; f+=4) {
          float mv; if (RF(mid+f, out mv) && mv>=5 && mv<=100.5f) meters++;
        }
        for (long f=0x200; f<=0x3C0; f+=4) {
          float bas, dmg;
          if (!RF(mid+f, out bas) || !RF(mid+f+4, out dmg)) continue;
          if (bas<50 || bas>800 || dmg<0 || dmg>bas+1) continue;
          if (!(dmg==0 || dmg<bas)) continue;
          // nearby floats snapshot
          var sb = new StringBuilder();
          sb.AppendFormat("path=+{0:X}/+{1:X}/+{2:X} base={3:F1} dmg={4:F1} metersOnMid={5} addr={6:X}", x,y,f,bas,dmg,meters, mid+f);
          // also check classic hunger offsets on outer+0x130
          long surv; float hung=0,th=0,ox=0;
          if (R8(outer+0x130, out surv) && LooksObj(surv)) {
            RF(surv+0x278, out hung); RF(surv+0x27C, out th); RF(surv+0x280, out ox);
            sb.AppendFormat(" surv130 hung={0:F1} th={1:F1} ox={2:F1}", hung,th,ox);
          }
          long stam; float cst=0,bst=0;
          if (R8(outer+0x150, out stam) && LooksObj(stam)) {
            RF(stam+0xD8, out cst); RF(stam+0xDC, out bst);
            sb.AppendFormat(" stam150 cur={0:F1} base={1:F1}", cst,bst);
          }
          // classic health mid+0x30 +0x280
          if (y==0x30 && f==0x280) sb.Append(" CLASSIC_LAYOUT");
          hits.Add(sb.ToString());
        }
      }
      // also classic direct: outer+0x30 -> +280/+284
      long hobj; 
      if (R8(outer+0x30, out hobj) && LooksObj(hobj)) {
        float bas,dmg;
        if (RF(hobj+0x280, out bas) && RF(hobj+0x284, out dmg) && bas>=20 && bas<=2000 && dmg>=0 && dmg<=bas+50) {
          hits.Add(string.Format("CLASSIC outer+{0:X} base={1:F1} dmg={2:F1} addr={3:X}", x, bas, dmg, hobj+0x280));
        }
      }
    }
    Console.WriteLine("HITS="+hits.Count);
    // print unique-ish top by preferring classic and meters
    hits.Sort((a,b) => {
      int sa = (a.Contains("CLASSIC")?100:0) + (a.Contains("stam150")?20:0) + (a.Contains("surv130")?20:0);
      int sb = (b.Contains("CLASSIC")?100:0) + (b.Contains("stam150")?20:0) + (b.Contains("surv130")?20:0);
      return sb.CompareTo(sa);
    });
    int shown=0;
    foreach (var h in hits) {
      Console.WriteLine(h);
      if (++shown>=40) break;
    }
    CloseHandle(handle);
  }
}
