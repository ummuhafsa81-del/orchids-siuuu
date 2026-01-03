import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings, X, LogOut, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { getAllUserStats, UserStats } from "@/lib/authStorage";
import * as tokenStorage from "@/lib/tokenStorage";
import { clearAuthState } from "@/lib/authPersistence";

interface UserSettingsPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  viewAsClient?: boolean;
  onViewAsClientToggle?: (val: boolean) => void;
}

const UserSettingsPanel = ({ 
  isOpen, 
  onToggle, 
  viewAsClient = false, 
  onViewAsClientToggle 
}: UserSettingsPanelProps) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  
  const [apiType, setApiType] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [openModelCombobox, setOpenModelCombobox] = useState(false);
  
  const [paypalClientId, setPaypalClientId] = useState("");
  const [paypalSecretKey, setPaypalSecretKey] = useState("");
  const [paypalPlanId, setPaypalPlanId] = useState("");
  
  const [subscriptionPrice, setSubscriptionPrice] = useState("135");
  const [subscriptionCurrency, setSubscriptionCurrency] = useState("$");

  const [apiEditorKey, setApiEditorKey] = useState("");
  const [apiEditorEndpoint, setApiEditorEndpoint] = useState("");
  const [apiEditorModel, setApiEditorModel] = useState("");
  const [modelSearchValue, setModelSearchValue] = useState("");

  const [maxTokensDay, setMaxTokensDay] = useState("");
  const [maxTokensMonth, setMaxTokensMonth] = useState("");
  
  const [dailyCredits, setDailyCredits] = useState(0);
  const [monthlyCredits, setMonthlyCredits] = useState(0);
  
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  
  // Client view editable fields (for admin testing)
  const [clientDailyTokens, setClientDailyTokens] = useState("5000");
  const [clientMonthlyTokens, setClientMonthlyTokens] = useState("50000");
  const [clientSubscriptionDays, setClientSubscriptionDays] = useState("30");

  useEffect(() => {
    const adminEmail = "abdisamadbashir14@gmail.com";
    const storedEmail = sessionStorage.getItem("userEmail");
    const isUserAdmin = storedEmail === adminEmail;
    setIsAdmin(isUserAdmin);
    fetchAiConfig();
  }, []);

  useEffect(() => {
    if (isAdmin && isOpen) {
      fetchUserStats();
      
      // Auto-refresh stats every 30 seconds when panel is open
      const interval = setInterval(fetchUserStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, isOpen]);

  // Load user token balance
    useEffect(() => {
      const loadTokens = async () => {
        const email = sessionStorage.getItem("userEmail");
        if (email) {
          // Load user's actual token balance
          const tokens = await tokenStorage.getUserTokens(email);
          setDailyCredits(tokens.dailyTokensRemaining);
          setMonthlyCredits(tokens.monthlyTokensRemaining);
          
          // Initialize client tokens from the limits
          setClientDailyTokens(tokens.dailyLimit.toString());
          setClientMonthlyTokens(tokens.monthlyLimit.toString());
        }
      };
      
      if (isOpen) {
        loadTokens();
      }
    }, [isOpen]);

  const fetchUserStats = async () => {
    setIsLoadingStats(true);
    try {
      const stats = await getAllUserStats();
      setUserStats(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchAiConfig = async (loadTokenLimits = true) => {
    try {
      const { data: globalData, error: globalError } = await supabase
        .from('ai_config')
        .select('*')
        .eq('id', 'global')
        .single();
      
      if (globalError && !globalError.message.includes('JSON object expected')) {
        console.error("Error fetching AI config:", globalError);
      }
      
      if (globalData) {
        setApiEditorKey(globalData.api_key || "");
        setApiEditorEndpoint(globalData.endpoint_url || "");
        setApiEditorModel(globalData.model || "");
      }

        const { data: paypalData } = await supabase
          .from('paypal_config')
          .select('*')
          .eq('id', 'global')
          .single();

        if (paypalData) {
          setPaypalClientId(paypalData.client_id || "");
          setPaypalSecretKey(paypalData.client_secret || "");
          setPaypalPlanId(paypalData.plan_id || "");
          setSubscriptionPrice(paypalData.subscription_price || "135");
          setSubscriptionCurrency(paypalData.subscription_currency || "$");
        }
      
      // Only load token limits on initial load, not on every config fetch
      if (loadTokenLimits) {
        const adminLimits = await tokenStorage.getAdminTokenLimits();
        console.log('Loaded admin limits:', adminLimits);
        setMaxTokensDay(adminLimits.dailyLimit.toString());
        setMaxTokensMonth(adminLimits.monthlyLimit.toString());
      }
    } catch (error) {
      console.error("Error fetching AI config:", error);
    }
  };

  useEffect(() => {
    const handleTokenUpdate = () => {
      fetchAiConfig(false); // Don't reload token limits on token update events
    };
    
    const handleLimitsUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<tokenStorage.GlobalTokenLimits>;
      if (customEvent.detail) {
        // Use the values from the event directly instead of re-fetching
        setMaxTokensDay(customEvent.detail.dailyLimit.toString());
        setMaxTokensMonth(customEvent.detail.monthlyLimit.toString());
      }
      // Reload user credits
      const email = sessionStorage.getItem("userEmail");
      if (email) {
        const tokens = await tokenStorage.getUserTokens(email);
        setDailyCredits(tokens.dailyTokensRemaining);
        setMonthlyCredits(tokens.monthlyTokensRemaining);
      }
    };

    window.addEventListener('token-update', handleTokenUpdate);
    window.addEventListener('price-update', handleTokenUpdate);
    window.addEventListener('paypal-update', handleTokenUpdate);
    window.addEventListener('token-limits-updated', handleLimitsUpdated);
    return () => {
      window.removeEventListener('token-update', handleTokenUpdate);
      window.removeEventListener('price-update', handleTokenUpdate);
      window.removeEventListener('paypal-update', handleTokenUpdate);
      window.removeEventListener('token-limits-updated', handleLimitsUpdated);
    };
  }, []);

  const popularModels = {
    chat: [
      "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-4o", "openai/gpt-4o-mini",
      "google/gemini-2.5-pro", "google/gemini-2.5-flash", "google/gemini-1.5-pro",
      "anthropic/claude-sonnet-4-5", "anthropic/claude-3-5-sonnet-20241022",
      "meta/llama-3.3-70b", "meta/llama-3.1-405b",
      "mistral/mistral-large-latest", "deepseek/deepseek-chat"
    ]
  };

  const getEndpointForModel = (model: string) => {
    if (model.startsWith("openai/")) return "https://api.openai.com/v1";
    if (model.startsWith("google/")) return "https://generativelanguage.googleapis.com/v1beta";
    if (model.startsWith("anthropic/")) return "https://api.anthropic.com/v1";
    if (model.startsWith("meta/")) return "https://api.together.xyz/v1";
    if (model.startsWith("mistral/")) return "https://api.mistral.ai/v1";
    if (model.startsWith("deepseek/")) return "https://api.deepseek.com/v1";
    return "";
  };

  useEffect(() => {
    const model = customModel || selectedModel;
    if (model) {
      const autoEndpoint = getEndpointForModel(model);
      setEndpoint(autoEndpoint);
    }
  }, [selectedModel, customModel]);

  const handleSaveApiEditor = async () => {
    try {
      const { error } = await supabase
        .from('ai_config')
        .upsert({
          id: 'global',
          api_key: apiEditorKey,
          endpoint_url: apiEditorEndpoint,
          model: apiEditorModel,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      toast.success("API configuration saved successfully");
      window.dispatchEvent(new Event('ai-config-update'));
    } catch (error: any) {
      console.error("Error saving config:", error);
      toast.error(error.message || "Failed to save configuration");
    }
  };

  const handleSavePayPalConfig = async () => {
      try {
        const { error } = await supabase
          .from('paypal_config')
          .upsert({
            id: 'global',
            client_id: paypalClientId,
            client_secret: paypalSecretKey,
            plan_id: paypalPlanId,
            subscription_price: subscriptionPrice,
            subscription_currency: subscriptionCurrency,
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
        toast.success("PayPal configuration saved successfully");
        window.dispatchEvent(new Event('paypal-update'));
        window.dispatchEvent(new Event('price-update'));
      } catch (error: any) {
        console.error("Error saving PayPal config:", error);
        toast.error(error.message || "Failed to save PayPal configuration");
      }
    };

  const handleSaveTokenLimits = async () => {
    try {
      const dailyLimit = parseInt(maxTokensDay);
      const monthlyLimit = parseInt(maxTokensMonth);
      
      if (isNaN(dailyLimit) || isNaN(monthlyLimit)) {
        toast.error("Please enter valid numbers");
        return;
      }
      
      console.log('Saving token limits:', { dailyLimit, monthlyLimit });
      await tokenStorage.saveAdminTokenLimits(dailyLimit, monthlyLimit);
      toast.success("Token limits saved successfully");
    } catch (error: any) {
      console.error("Error saving token limits:", error);
      toast.error(error.message || "Failed to save token limits");
    }
  };

  const handleLogout = () => {
    clearAuthState();
    setShowLogoutDialog(false);
    window.location.href = "/";
  };

  return (
    <>
      <Button
        onClick={onToggle}
        variant="ghost"
        size="icon"
        className={`fixed top-4 left-4 z-50 transition-all duration-300 ${isOpen ? 'rotate-90 scale-110' : 'hover:scale-105'}`}
      >
        <Settings className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={onToggle} />
          
          <div className={`fixed left-0 top-0 h-full w-80 bg-background border-r border-border shadow-xl overflow-y-auto z-50 transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  {isAdmin && !viewAsClient ? "Administrator Settings" : "User Settings"}
                  {viewAsClient && <span className="ml-2 text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">CLIENT VIEW</span>}
                </h2>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Button 
                        onClick={() => onViewAsClientToggle?.(!viewAsClient)} 
                        variant="outline" 
                        size="sm"
                        className={viewAsClient ? "bg-yellow-100 border-yellow-400 text-yellow-800" : ""}
                      >
                        {viewAsClient ? "Back to Admin" : "View as Client"}
                      </Button>
                    )}
                    <Button onClick={onToggle} variant="ghost" size="icon" className="hover:bg-accent">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
              </div>

              <div className="space-y-4">
                {isAdmin && !viewAsClient ? (
                    <>
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-foreground">User Statistics</h3>
                          <Button variant="ghost" size="sm" onClick={fetchUserStats} disabled={isLoadingStats} className="h-6 px-2 text-xs">
                            {isLoadingStats ? "..." : "Refresh"}
                          </Button>
                        </div>
                        {isLoadingStats ? (
                          <div className="h-[100px] flex items-center justify-center text-sm text-muted-foreground">
                            Loading stats...
                          </div>
                        ) : (
                          <div className="space-y-2 pt-3 border-t border-border">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-sm text-foreground">Verified Users</span>
                              </div>
                              <span className="font-semibold text-foreground">{userStats?.verifiedUsers || 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-sm text-foreground">Active Subscribers</span>
                              </div>
                              <span className="font-semibold text-foreground">{userStats?.activeUsers || 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                <span className="text-sm text-foreground">Pending Users</span>
                              </div>
                              <span className="font-semibold text-foreground">{userStats?.pendingUsers || 0}</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                              <span className="text-sm font-medium text-foreground">Total Users</span>
                              <span className="font-bold text-lg text-foreground">{userStats?.totalUsers || 0}</span>
                            </div>
                          </div>
                        )}
                      </div>

                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-foreground">AI API Editor</h3>
                      <div>
                        <Label htmlFor="ai-api-key" className="text-sm font-medium text-foreground mb-1 block">API Key</Label>
                        <Input
                          id="ai-api-key"
                          type="password"
                          placeholder="Enter API key..."
                          value={apiEditorKey}
                          onChange={(e) => setApiEditorKey(e.target.value)}
                          className="border-border focus:border-nova-pink"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ai-api-endpoint" className="text-sm font-medium text-foreground mb-1 block">API Endpoint</Label>
                        <Input
                          id="ai-api-endpoint"
                          type="text"
                          placeholder="Enter API endpoint URL..."
                          value={apiEditorEndpoint}
                          onChange={(e) => setApiEditorEndpoint(e.target.value)}
                          className="border-border focus:border-nova-pink"
                        />
                      </div>
                      <div>
                          <Label htmlFor="ai-api-model" className="text-sm font-medium text-foreground mb-1 block">API Model</Label>
                          <div className="flex gap-2">
                            <Input
                              id="ai-api-model"
                              type="text"
                              placeholder="Enter model name (e.g., gpt-4o, claude-3-opus)..."
                              value={apiEditorModel}
                              onChange={(e) => setApiEditorModel(e.target.value)}
                              className="flex-1 border-border focus:border-nova-pink"
                            />
                            <Popover open={openModelCombobox} onOpenChange={setOpenModelCombobox}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="icon" className="shrink-0 border-border">
                                  <ChevronsUpDown className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-0 z-[60]" align="end">
                                <Command>
                                  <CommandInput 
                                    placeholder="Search models..." 
                                    value={modelSearchValue}
                                    onValueChange={setModelSearchValue} 
                                  />
                                  <CommandEmpty className="p-2 text-xs text-muted-foreground">
                                    No matching models. Type directly in the input field.
                                  </CommandEmpty>
                                  <CommandGroup className="max-h-60 overflow-auto">
                                    {popularModels.chat.map((model) => (
                                      <CommandItem 
                                        key={model} 
                                        value={model} 
                                        onSelect={(currentValue) => { 
                                          setApiEditorModel(currentValue); 
                                          setOpenModelCombobox(false); 
                                          if (!apiEditorEndpoint) { 
                                            setApiEditorEndpoint(getEndpointForModel(currentValue) + "/chat/completions"); 
                                          } 
                                        }}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", apiEditorModel === model ? "opacity-100" : "opacity-0")} />
                                        {model}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Type any model name or click dropdown to select</p>
                        </div>
                      <Button onClick={handleSaveApiEditor} className="w-full bg-nova-pink hover:bg-nova-pink/90">Save API Configuration</Button>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-foreground">Token Limits</h3>
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-1 block">Max Tokens per Day</Label>
                        <Input type="number" value={maxTokensDay} onChange={(e) => setMaxTokensDay(e.target.value)} className="border-border focus:border-nova-pink" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-1 block">Max Tokens per Month</Label>
                        <Input type="number" value={maxTokensMonth} onChange={(e) => setMaxTokensMonth(e.target.value)} className="border-border focus:border-nova-pink" />
                      </div>
                      <Button onClick={handleSaveTokenLimits} className="w-full bg-nova-pink hover:bg-nova-pink/90">Save Token Limits</Button>
                    </div>

<div className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground">PayPal API Management</h3>
                        <div>
                          <Label htmlFor="paypal-client-id" className="text-sm font-medium text-foreground mb-1 block">Client ID</Label>
                          <Input id="paypal-client-id" type="text" placeholder="Enter PayPal Client ID" value={paypalClientId} onChange={(e) => setPaypalClientId(e.target.value)} className="border-border focus:border-nova-pink" />
                        </div>
                        <div>
                          <Label htmlFor="paypal-secret-key" className="text-sm font-medium text-foreground mb-1 block">Secret Key</Label>
                          <Input id="paypal-secret-key" type="password" placeholder="Enter PayPal Secret Key" value={paypalSecretKey} onChange={(e) => setPaypalSecretKey(e.target.value)} className="border-border focus:border-nova-pink" />
                        </div>
                        <div>
                          <Label htmlFor="paypal-plan-id" className="text-sm font-medium text-foreground mb-1 block">Subscription Plan ID (Optional)</Label>
                          <Input id="paypal-plan-id" type="text" placeholder="Enter PayPal Plan ID for recurring" value={paypalPlanId} onChange={(e) => setPaypalPlanId(e.target.value)} className="border-border focus:border-nova-pink" />
                        </div>
                        <Button onClick={handleSavePayPalConfig} className="w-full bg-nova-pink hover:bg-nova-pink/90">Save PayPal Settings</Button>
                      </div>

                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-foreground">Subscription Pricing</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <Label htmlFor="subscription-currency" className="text-sm font-medium text-foreground mb-1 block">Currency</Label>
                          <Input id="subscription-currency" type="text" placeholder="$" value={subscriptionCurrency} onChange={(e) => setSubscriptionCurrency(e.target.value)} className="border-border focus:border-nova-pink" />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="subscription-price" className="text-sm font-medium text-foreground mb-1 block">Price</Label>
                          <Input id="subscription-price" type="number" step="0.01" placeholder="20.99" value={subscriptionPrice} onChange={(e) => setSubscriptionPrice(e.target.value)} className="border-border focus:border-nova-pink" />
                        </div>
                      </div>
                      <Button onClick={handleSavePayPalConfig} className="w-full bg-nova-pink hover:bg-nova-pink/90">Save Price</Button>
                    </div>

                    <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                      <Label className="text-sm font-medium text-foreground">Email Address</Label>
                      <p className="text-sm text-foreground break-all">{localStorage.getItem("userEmail") || "Not set"}</p>
                    </div>

                    <div className="pt-3 border-t border-border">
                      <Button onClick={() => setShowLogoutDialog(true)} variant="destructive" className="w-full flex items-center gap-2">
                        <LogOut className="h-4 w-4" />
                        Log Out
                      </Button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs text-foreground leading-relaxed">
                        Nova is owned and operated by Abdisamad, 15 years old. By using Nova, you agree to follow its rules, respect its services, and understand that all rights to the platform belong to Abdisamad.
                      </p>
                    </div>
                  </>
) : (
                    <>
                      {/* Admin viewing as client - show editable preview */}
                      {isAdmin && viewAsClient && (
                        <div className="bg-yellow-50 border border-yellow-300 p-3 rounded-lg mb-4">
                          <p className="text-xs text-yellow-800 font-medium mb-2">Admin Preview Mode - Edit values to test client experience</p>
                        </div>
                      )}
                      
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <h3 className="text-sm font-medium text-foreground mb-3">Token Balance</h3>
                          <div className="space-y-3">
                            <div className="p-2 bg-background rounded border border-border">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-nova-pink" />
                                <p className="text-xs text-gray-500">Daily Credits</p>
                              </div>
                              <p className="text-sm font-semibold text-foreground">{dailyCredits.toLocaleString()}</p>
                            </div>
                            <div className="p-2 bg-background rounded border border-border">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-nova-coral" />
                                <p className="text-xs text-gray-500">Monthly Credits</p>
                              </div>
                              <p className="text-sm font-semibold text-foreground">{monthlyCredits.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>

                      <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                        <Label className="text-sm font-medium text-foreground">Email Address</Label>
                        <p className="text-sm text-foreground break-all">
                          {isAdmin && viewAsClient ? "client@example.com" : (localStorage.getItem("userEmail") || "Not set")}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-border">
                        <Button onClick={() => setShowLogoutDialog(true)} variant="destructive" className="w-full flex items-center gap-2">
                          <LogOut className="h-4 w-4" />
                          Log Out
                        </Button>
                      </div>
                    </>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
            <DialogDescription>
              Are you sure you want to log out? You will need to sign in again to access your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>No</Button>
            <Button variant="destructive" onClick={handleLogout}>Yes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserSettingsPanel;
