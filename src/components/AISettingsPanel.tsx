import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Menu, X, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type ContentType = 'chat';

interface AISettingsPanelProps {
  activeTab: ContentType;
  isOpen: boolean;
  onToggle: () => void;
  isAdmin?: boolean;
}

export interface ChatSettings {
  customInstructions: string;
  personalInstructions: string;
}

const BUCKET_NAME = 'ai-behavior-settings';

const loadSettingsFromStorage = async (userId: string, fileName: string): Promise<string> => {
  try {
    const path = `${userId}/${fileName}.txt`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(path);
    
    if (error || !data) return "";
    return await data.text();
  } catch {
    return "";
  }
};

const saveSettingsToStorage = async (userId: string, fileName: string, content: string): Promise<boolean> => {
  try {
    const path = `${userId}/${fileName}.txt`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, blob, { upsert: true });
    
    if (error) {
      console.error('Upload error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Save settings error:', err);
    return false;
  }
};

const AISettingsPanel = ({ 
  isOpen, 
  onToggle, 
  isAdmin: propIsAdmin 
}: AISettingsPanelProps) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isActualAdmin, setIsActualAdmin] = useState(false);
  
  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : isActualAdmin;
  
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    customInstructions: "",
    personalInstructions: ""
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const userEmail = sessionStorage.getItem("userEmail");
    if (userEmail) {
      const isAdminUser = userEmail === "abdisamadbashir14@gmail.com";
      setIsActualAdmin(isAdminUser);
      if (isAdminUser) {
        setCurrentUserId("admin");
      } else {
        setCurrentUserId(userEmail.replace(/[^a-z0-9]/g, '_'));
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen && currentUserId) {
      const loadSettings = async () => {
        setIsLoading(true);
        try {
          if (isAdmin) {
            const globalInstructions = await loadSettingsFromStorage("global", "system-behavior");
            setChatSettings(prev => ({ ...prev, customInstructions: globalInstructions }));
            
            const adminPersonal = await loadSettingsFromStorage("admin", "personal-behavior");
            setChatSettings(prev => ({ ...prev, personalInstructions: adminPersonal }));
          } else {
            const personalInstructions = await loadSettingsFromStorage(currentUserId, "personal-behavior");
            setChatSettings(prev => ({ ...prev, personalInstructions: personalInstructions }));
          }
        } catch (err) {
          console.error("Error loading settings:", err);
        } finally {
          setIsLoading(false);
        }
      };
      loadSettings();
    }
  }, [isAdmin, isOpen, currentUserId]);

  const handleSaveGlobalSettings = async () => {
    if (!isAdmin) return;
    
    setIsSaving(true);
    try {
      const success = await saveSettingsToStorage("global", "system-behavior", chatSettings.customInstructions);
      if (!success) throw new Error("Failed to save");
      
      toast.success("Global instructions saved");
      window.dispatchEvent(new CustomEvent('ai-config-update'));
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePersonalSettings = async () => {
    if (!currentUserId) return;
    
    setIsSaving(true);
    try {
      const userId = isAdmin ? "admin" : currentUserId;
      const success = await saveSettingsToStorage(userId, "personal-behavior", chatSettings.personalInstructions);
      if (!success) throw new Error("Failed to save");
      
      toast.success("Personal instructions saved");
      window.dispatchEvent(new CustomEvent('ai-config-update'));
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderAdminSettings = () => (
    <section className="mb-8 pb-8 border-b border-border">
      <Label htmlFor="global-instructions" className="text-sm font-semibold text-foreground mb-3 block flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-nova-pink" />
        Global Custom Instructions (Admin)
      </Label>
      <Textarea
        id="global-instructions"
        placeholder="Write specific guidance for the AI behavior across the entire platform..."
        value={chatSettings.customInstructions}
        onChange={(e) => setChatSettings(prev => ({ ...prev, customInstructions: e.target.value }))}
        className="min-h-[120px] resize-none border-border focus:ring-1 focus:ring-nova-pink bg-background/50 text-sm"
      />
      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed italic">
        These instructions control the AI behavior silently across the entire platform. Users will not see these settings.
      </p>
      <Button 
        onClick={handleSaveGlobalSettings} 
        disabled={isSaving}
        className="mt-4 w-full bg-nova-pink hover:bg-nova-pink/90 text-white font-medium shadow-sm transition-all h-9"
      >
        {isSaving ? "Saving..." : "Save Global Instructions"}
      </Button>
    </section>
  );

  const renderUserSettings = () => (
    <section>
      <Label htmlFor="personal-instructions" className="text-sm font-semibold text-foreground mb-3 block">
        Personal AI Instructions
      </Label>
      <Textarea
        id="personal-instructions"
        placeholder="How do you want the AI to behave for YOU? (e.g. 'Always answer in bullet points', 'Keep it professional')..."
        value={chatSettings.personalInstructions}
        onChange={(e) => setChatSettings(prev => ({ ...prev, personalInstructions: e.target.value }))}
        className="min-h-[150px] resize-none border-border focus:ring-1 focus:ring-nova-pink bg-background/50 text-sm"
      />
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed italic">
          Personalize how the AI responds to you.
        </p>
      <Button 
        onClick={handleSavePersonalSettings} 
        disabled={isSaving}
        variant="outline"
        className="mt-4 w-full border-border hover:bg-muted font-medium transition-all h-9"
      >
        {isSaving ? "Saving..." : "Save Personal Instructions"}
      </Button>
    </section>
  );

  return (
    <>
      <Button
        onClick={onToggle}
        variant="ghost"
        size="icon"
        className={`fixed top-4 right-4 z-50 transition-all duration-300 ${isOpen ? 'rotate-90' : ''}`}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" 
            onClick={onToggle}
          />
          
          <div className="relative h-full w-80 bg-background border-l border-border shadow-2xl overflow-y-auto z-50 flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between bg-background sticky top-0 z-10">
              <h2 className="text-lg font-bold text-foreground">
                AI Customization
              </h2>
              <Button
                onClick={onToggle}
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6 flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nova-pink"></div>
                </div>
              ) : (
                <div className="space-y-6">
                    {isAdmin ? (
                      <>
                        {renderAdminSettings()}
                        {renderUserSettings()}
                      </>
                    ) : (
                      renderUserSettings()
                    )}
                  </div>
              )}
            </div>
            

          </div>
        </div>
      )}
    </>
  );
};

export default AISettingsPanel;
