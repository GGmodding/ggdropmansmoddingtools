using System; using System.Collections.Generic; using System.IO; using System.Text;
public class GW {
  static uint Delta(byte[] d, long off) {
    int pe=BitConverter.ToInt32(d,0x3C); int n=BitConverter.ToUInt16(d,pe+6); int so=BitConverter.ToUInt16(d,pe+20); int s0=pe+24+so;
    for(int i=0;i<n;i++){ int o=s0+i*40; uint va=BitConverter.ToUInt32(d,o+12); uint raw=BitConverter.ToUInt32(d,o+20); uint rsz=BitConverter.ToUInt32(d,o+16);
      if(off>=raw && off<raw+rsz) return va-raw; }
    return 0;
  }
  public static void Main(string[] a){
    byte[] hay=File.ReadAllBytes(a[0]);
    uint dataVA=176971776u, dataEnd=dataVA+7062508u;
    int found=0;
    // scan 48 89 05
    for(long i=0;i<hay.Length-20;i++){
      if(hay[i]!=0x48||hay[i+1]!=0x89||hay[i+2]!=0x05) continue;
      uint d=Delta(hay,i); long rva=i+d; int rel=BitConverter.ToInt32(hay,(int)(i+3)); long tgt=rva+7+rel;
      if(tgt<dataVA || tgt>=dataEnd) continue;
      // score: look ahead 30 bytes for F6 86 / F6 80 / 40 75 world-flag tests
      int score=0; string why="";
      for(int k=7;k<40 && i+k+5<hay.Length;k++){
        if(hay[i+k]==0xF6 && (hay[i+k+1]==0x86 || hay[i+k+1]==0x80 || hay[i+k+1]==0x81)) { score+=3; why+="F6 "; }
        if(hay[i+k]==0x40 && hay[i+k+1]==0x75) { score+=2; why+="40 75 "; }
        if(hay[i+k]==0x0F && hay[i+k+1]==0xBA) { score+=1; why+="BT "; }
      }
      if(score<2) continue;
      var sb=new StringBuilder(); for(int k=0;k<28;k++) sb.Append(hay[i+k].ToString("X2")).Append(' ');
      Console.WriteLine(string.Format("score={0} rvaInstr=0x{1:X} GWorld?=0x{2:X} {3}\n  {4}", score, rva, tgt, why, sb));
      if(++found>=25) break;
    }
    Console.WriteLine("candidates="+found);
  }
}
