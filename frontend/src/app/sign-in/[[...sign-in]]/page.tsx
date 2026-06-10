import { SignIn } from "@clerk/nextjs";
import { RewindOpsLogo } from "@/components/RewindOpsLogo";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050711] gap-8">
      <div className="flex items-center gap-3">
        <RewindOpsLogo size={40} />
        <div className="flex flex-col">
          <span className="text-lg font-bold text-white tracking-tight">RewindOps AI</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Policy & Rollback Proxy</span>
        </div>
      </div>
      <SignIn />
    </div>
  );
}
