import { SignUp } from "@clerk/react-router";
export default function SignUpPage() {
  return <div className="flex justify-center py-10"><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/onboarding" /></div>;
}
