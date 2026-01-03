import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: "Error",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitted(true);
    toast({
      title: "Code sent!",
      description: "Check your email for the 6-digit code",
    });
  };

  const handleConfirmCode = () => {
    if (resetCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter a valid 6-digit code",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Code verified!",
      description: "Redirecting to reset password",
    });

    setTimeout(() => {
      navigate("/reset-password", { state: { email, code: resetCode } });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-[var(--shadow-card)]">
          <CardHeader className="text-center pb-6">
            <h2 className="text-2xl font-semibold text-foreground">
              {isSubmitted ? "Check your email" : "Reset password"}
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              {isSubmitted
                ? "We've sent password reset instructions to your email"
                : "Enter your email and we'll send you reset instructions"}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {!isSubmitted ? (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 border-border focus:border-nova-pink transition-colors"
                  />
                </div>

                <Button
                  type="submit"
                  variant="nova"
                  size="lg"
                  className="w-full h-12"
                >
                  Send code
                </Button>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                  >
                    <ArrowLeft size={16} />
                    Back to login
                  </Link>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="reset-code"
                      className="text-sm font-medium text-foreground"
                    >
                      Reset Code
                    </Label>
                    <Input
                      id="reset-code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="h-12 border-border focus:border-nova-pink transition-colors text-center text-lg tracking-widest"
                      maxLength={6}
                    />
                  </div>

                  <Button
                    variant="nova"
                    size="lg"
                    className="w-full h-12"
                    onClick={handleConfirmCode}
                    disabled={resetCode.length !== 6}
                  >
                    Confirm code
                  </Button>
                </div>

                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the code? Check your spam folder or
                  </p>
                  <Button
                    onClick={() => setIsSubmitted(false)}
                    variant="outline"
                    size="lg"
                    className="w-full h-12"
                  >
                    Resend code
                  </Button>
                </div>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                  >
                    <ArrowLeft size={16} />
                    Back to login
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
