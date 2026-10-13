// UI foundation
export { AuthLayout } from "./components/layout/AuthLayout";
export { EditorialPanel } from "./components/layout/EditorialPanel";
export { AuthCard } from "./components/layout/AuthCard";
export { AuthHeader } from "./components/layout/AuthHeader";
export { AuthFooter } from "./components/layout/AuthFooter";
export { SocialLoginButtons } from "./components/social/SocialLoginButtons";
export { SocialButton } from "./components/social/SocialButton";
export { Divider } from "./components/social/Divider";
export { GoogleIcon, FacebookIcon } from "./components/social/icons";
export { EmailInput } from "./components/fields/EmailInput";
export { PasswordInput } from "./components/fields/PasswordInput";
export { VerificationPending } from "./components/feedback/VerificationPending";
export { AuthSuccessState } from "./components/feedback/AuthSuccessState";
export { AuthButton } from "./components/AuthButton";
export { SignOutButton } from "./components/SignOutButton";
export { LoginForm } from "./components/forms/LoginForm";
export { RegisterForm } from "./components/forms/RegisterForm";
export { ForgotPasswordForm } from "./components/forms/ForgotPasswordForm";
export { ResetPasswordForm } from "./components/forms/ResetPasswordForm";

// Actions & schemas (already built, wired in the next phase)
export {
  signInAction,
  signUpAction,
  signOutAction,
  signInWithOAuthAction,
  requestPasswordResetAction,
  updatePasswordAction,
  resendVerificationAction,
} from "./actions/auth.actions";
export {
  signInSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  oauthSignInSchema,
  OAUTH_PROVIDERS,
  NEW_PASSWORD_MIN,
} from "./schemas/auth.schema";
export type {
  SignInInput,
  SignUpInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  OAuthProvider,
} from "./schemas/auth.schema";
export { mapAuthError, mapOAuthCallbackError } from "./constants/auth-errors";
