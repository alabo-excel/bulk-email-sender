import { SignIn } from "@clerk/react-router";
export default function SignInPage() {
  return <div className="flex justify-center py-10"><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" /></div>;
}
