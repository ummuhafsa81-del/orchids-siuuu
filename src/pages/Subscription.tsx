import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { NovaLogoSvg } from "@/components/NovaLogoSvg";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { verifyUserAfterPayment, deletePendingUser } from "@/lib/authStorage";
import { supabase } from "@/lib/supabase";

const Subscription = () => {
  const navigate = useNavigate();
  const [price, setPrice] = useState("135");
  const [currency, setCurrency] = useState("$");
  const [paypalClientId, setPaypalClientId] = useState("");
  const [paypalPlanId, setPaypalPlanId] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");

  useEffect(() => {
    const email = sessionStorage.getItem("pendingEmail");
    const isPending = sessionStorage.getItem("pendingSignup");
    
    if (!email || !isPending) {
      toast.error("Please sign up first.");
      navigate("/signup");
      return;
    }
    
    setPendingEmail(email);
    
    const loadSettings = async () => {
      try {
        const { data } = await supabase
          .from('paypal_config')
          .select('*')
          .eq('id', 'global')
          .single();
        
        if (data) {
          if (data.client_id) setPaypalClientId(data.client_id);
          if (data.plan_id) setPaypalPlanId(data.plan_id);
          if (data.subscription_price) setPrice(data.subscription_price);
          if (data.subscription_currency) setCurrency(data.subscription_currency);
        }
      } catch (err) {
        console.error("Error loading platform settings:", err);
      }
    };

    loadSettings();
    window.addEventListener("price-update", loadSettings);
    window.addEventListener("paypal-update", loadSettings);

    return () => {
      window.removeEventListener("price-update", loadSettings);
      window.removeEventListener("paypal-update", loadSettings);
    };
  }, [navigate]);

  const handleSubscriptionSuccess = async (data: any) => {
    try {
      const pendingPassword = sessionStorage.getItem("pendingPassword");
      const result = await verifyUserAfterPayment(pendingEmail, pendingPassword || undefined, data.subscriptionID);
      
      if (result.success) {
        sessionStorage.removeItem("pendingEmail");
        sessionStorage.removeItem("pendingPassword");
        sessionStorage.removeItem("pendingSignup");
        
        sessionStorage.setItem("userEmail", pendingEmail);
        sessionStorage.setItem("isAdmin", "false");
        sessionStorage.setItem("isAuthenticated", "true");
        
        toast.success("Subscription successful! Your account is now active.");
        setTimeout(() => {
          navigate("/ai");
        }, 1500);
      } else {
        toast.error(result.error || "Failed to activate account.");
      }
    } catch (err) {
      console.error("Error verifying payment:", err);
      toast.error("Payment received but account activation failed. Please contact support.");
    }
  };

  const handleOrderSuccess = async (details: any) => {
    try {
      const pendingPassword = sessionStorage.getItem("pendingPassword");
      const result = await verifyUserAfterPayment(pendingEmail, pendingPassword || undefined, details?.id);
      
      if (result.success) {
        sessionStorage.removeItem("pendingEmail");
        sessionStorage.removeItem("pendingPassword");
        sessionStorage.removeItem("pendingSignup");
        
        sessionStorage.setItem("userEmail", pendingEmail);
        sessionStorage.setItem("isAdmin", "false");
        sessionStorage.setItem("isAuthenticated", "true");
        
        toast.success("Payment successful! Your account is now active.");
        setTimeout(() => {
          navigate("/ai");
        }, 1500);
      } else {
        toast.error(result.error || "Failed to activate account.");
      }
    } catch (err) {
      console.error("Error verifying payment:", err);
      toast.error("Payment received but account activation failed. Please contact support.");
    }
  };

  const handlePaymentError = async (err: any) => {
    console.error("PayPal Error:", err);
    toast.error("Payment failed. Your account was not created.");
    sessionStorage.removeItem("pendingEmail");
    sessionStorage.removeItem("pendingPassword");
    sessionStorage.removeItem("pendingSignup");
  };

  const handleBackToSignup = async () => {
    sessionStorage.removeItem("pendingEmail");
    sessionStorage.removeItem("pendingPassword");
    sessionStorage.removeItem("pendingSignup");
    navigate("/signup");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <button onClick={handleBackToSignup}>
          <ArrowLeft className="w-5 h-5 text-gray-600 hover:text-foreground transition-colors" />
        </button>
        <div className="w-5" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 w-full">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-nova-pink/5 to-nova-coral/5 border-b border-gray-100 p-8 flex items-center justify-center">
            <NovaLogoSvg className="h-20 w-auto" />
          </div>

          <div className="border-b border-gray-100 p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Complete payment for: <strong>{pendingEmail}</strong>
            </p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-6xl font-bold bg-gradient-to-r from-nova-pink to-nova-coral bg-clip-text text-transparent">
                {currency}
                {price}
              </span>
              <span className="text-gray-600 font-medium">/month</span>
            </div>
          </div>

          <div className="p-8 border-b border-gray-100">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-nova-pink mt-2 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">
                    Seamless Workflow Automation
                  </p>
                  <p className="text-xs text-gray-600">
                    Stop managing manual tasks. NOVA integrates with your
                    existing tools.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-nova-coral mt-2 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">
                    Scalable Business Optimization
                  </p>
                  <p className="text-xs text-gray-600">
                    Create self-improving workflows that grow with your company.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-nova-pink mt-2 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">
                    Intelligent Chat & Lightning Fast
                  </p>
                  <p className="text-xs text-gray-600">
                    Real-time AI processing that keeps up with your thoughts.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-nova-pink/5 to-nova-coral/5 p-8">
            {paypalClientId ? (
              <PayPalScriptProvider 
                options={{ 
                  clientId: paypalClientId,
                  vault: true,
                  intent: paypalPlanId ? "subscription" : "capture"
                }}
              >
                <div className="w-full min-h-[50px]">
                  {paypalPlanId ? (
                    <PayPalButtons
                      style={{ 
                        layout: "vertical",
                        color: "gold",
                        shape: "rect",
                        label: "subscribe"
                      }}
                      createSubscription={(data, actions) => {
                        return actions.subscription.create({
                          plan_id: paypalPlanId
                        });
                      }}
                      onApprove={async (data, actions) => {
                        await handleSubscriptionSuccess(data);
                      }}
                      onError={handlePaymentError}
                      onCancel={() => {
                        toast.info("Payment cancelled. Your account is not yet active.");
                      }}
                    />
                  ) : (
                    <PayPalButtons
                      style={{ 
                        layout: "vertical",
                        color: "gold",
                        shape: "rect",
                        label: "checkout"
                      }}
                      createOrder={(data, actions) => {
                        return actions.order.create({
                          intent: "CAPTURE",
                          purchase_units: [
                            {
                              amount: {
                                currency_code: "USD",
                                value: price,
                              },
                              description: "NOVA Monthly Subscription"
                            },
                          ],
                        });
                      }}
                      onApprove={async (data, actions) => {
                        const details = await actions.order?.capture();
                        await handleOrderSuccess(details);
                      }}
                      onError={handlePaymentError}
                      onCancel={() => {
                        toast.info("Payment cancelled. Your account is not yet active.");
                      }}
                    />
                  )}
                </div>
              </PayPalScriptProvider>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p>PayPal is not configured. Please contact the administrator.</p>
                </div>
                <Button
                  disabled
                  className="w-full h-12 bg-gray-200 text-gray-400 font-semibold text-base rounded-lg"
                >
                  Subscription Disabled
                </Button>
              </div>
            )}
            
              <p className="text-xs text-gray-500 text-center mt-4">
                Secure payment powered by PayPal.
              </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
