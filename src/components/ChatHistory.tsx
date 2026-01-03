import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Trash2, MoreVertical, Pencil, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as chatStorage from "@/lib/chatStorage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  preview: string;
}

interface ChatHistoryProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onNewChat: () => void;
  onLoadChat: (sessionId: string) => void;
}

const ChatHistory = ({ isOpen = false, onOpenChange, onNewChat, onLoadChat }: ChatHistoryProps) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  useEffect(() => {
    const loadSessions = async () => {
      setIsLoading(true);
      try {
        const uid = await chatStorage.getUserId();
        setUserId(uid);
        
        if (uid) {
          const storedSessions = await chatStorage.getAllSessions(uid);
          console.log('Loaded sessions:', storedSessions);
          setSessions(
            storedSessions.map((s) => ({
              id: s.id,
              title: s.title,
              timestamp: new Date(s.timestamp),
              preview: s.preview,
            }))
          );
        }
      } catch (err) {
        console.error('Error loading sessions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (isOpen) {
      loadSessions();
    }
    
    // Listen for session updates
    const handleSessionUpdate = () => {
      if (isOpen) loadSessions();
    };
    window.addEventListener('chat-session-saved', handleSessionUpdate);
    return () => window.removeEventListener('chat-session-saved', handleSessionUpdate);
  }, [isOpen]);

  const handleClearHistory = async () => {
    if (!userId) return;
    await chatStorage.clearAllSessions(userId);
    setSessions([]);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!userId) return;
    
    await chatStorage.deleteSession(userId, sessionId);
    setSessions(sessions.filter(s => s.id !== sessionId));
  };

  const handleRenameClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    setRenameSessionId(sessionId);
    setRenameTitle(session.title);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!userId || !renameSessionId || !renameTitle.trim()) return;
    
    await chatStorage.renameSession(userId, renameSessionId, renameTitle.trim());
    setSessions(sessions.map(s => 
      s.id === renameSessionId ? { ...s, title: renameTitle.trim() } : s
    ));
    setRenameDialogOpen(false);
    setRenameSessionId(null);
    setRenameTitle("");
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
          >
            <Clock className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80 bg-background border-border z-[100]" align="center">
          <div className="flex items-center justify-between px-2 py-2">
            <h3 className="text-sm font-semibold text-foreground">Chat History</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewChat}
              className="h-8 text-xs hover:bg-accent"
            >
              <Plus className="h-3 w-3 mr-1" />
              New Chat
            </Button>
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No chat history yet
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onLoadChat(session.id)}
                  className="group flex flex-col items-start gap-1 p-3 cursor-pointer hover:bg-accent relative"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-sm truncate max-w-[180px]">{session.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(session.timestamp)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate w-full pr-8">
                    {session.preview}
                  </span>
                  
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32 z-[110]">
                        <DropdownMenuItem onClick={(e) => handleRenameClick(e, session.id)}>
                          <Pencil className="h-3 w-3 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Enter new title"
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatHistory;
