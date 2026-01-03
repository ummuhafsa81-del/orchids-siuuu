import { useState, useRef, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Copy, RefreshCw, Check, ClipboardCopy } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AutomationTodoList, AutomationStep } from "@/components/AutomationTodoList";
import { toast } from "sonner";
import { Attachment } from "@/components/ChatInput";
import { CapturedScreenshot } from "@/lib/automation/screenshotService";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  attachments?: Attachment[];
}

const cleanAIThoughts = (text: string): string => {
  if (!text) return text;
  
  let cleaned = text;
  
  // Remove XML-style thought blocks
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.replace(/<internal>[\s\S]*?<\/internal>/gi, '');
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  cleaned = cleaned.replace(/<reflection>[\s\S]*?<\/reflection>/gi, '');
  cleaned = cleaned.replace(/<plan>[\s\S]*?<\/plan>/gi, '');
  
  // Remove markdown-style thought blocks
  cleaned = cleaned.replace(/\*thinking\*[\s\S]*?\*(?:end thinking|\/thinking)\*/gi, '');
  cleaned = cleaned.replace(/\*\*thinking\*\*[\s\S]*?\*\*(?:end thinking|\/thinking)\*\*/gi, '');
  cleaned = cleaned.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '');
  cleaned = cleaned.replace(/\[internal\][\s\S]*?\[\/internal\]/gi, '');
  
  // Remove sentences containing thought patterns (anywhere in the text)
  const sentenceThoughtPatterns = [
    /[^.]*\bthe user (says|said|wants|is asking|asked|needs|requesting|mentioned|requests)\b[^.]*\./gi,
    /[^.]*\bi (need to|should|must|will|have to|want to|'ll)\s+(respond|answer|reply|address|help|think|consider|analyze)[^.]*\./gi,
    /[^.]*\b(my response should|i'll respond|i should respond|i must respond)\b[^.]*\./gi,
    /[^.]*\b(let me|i'm going to|i will now)\s+(think|analyze|process|consider|respond)[^.]*\./gi,
    /[^.]*\b(internally|in my mind|mentally)\b[^.]*\./gi,
    /[^.]*\b(as an ai|as a language model|as an assistant)\b[^.]*\./gi,
  ];
  
  for (const pattern of sentenceThoughtPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Split into paragraphs and filter
  const paragraphs = cleaned.split(/\n\n+/);
  const filteredParagraphs = paragraphs.filter(para => {
    const trimmed = para.trim().toLowerCase();
    if (!trimmed) return false;
    
    // Remove paragraphs that ARE thoughts (contain thought phrases anywhere)
    const thoughtPhrases = [
      'the user says', 'the user said', 'the user wants', 'the user is asking',
      'the user asked', 'the user needs', 'the user mentioned', 'the user requests',
      'i need to respond', 'i should respond', 'i must respond', 'i will respond',
      'my response should', 'i\'ll respond', 'let me respond', 'responding to this',
      'let me think', 'let me analyze', 'let me consider', 'let me process',
      'i need to think', 'i should think', 'i must think',
      'based on the user', 'from the user\'s', 'the user\'s request', 'the user\'s query',
      'in my mind', 'internally', 'mentally', 'my thought process',
      'as an ai', 'as a language model', 'as an assistant', 'i am programmed',
      'my task is', 'my job is', 'my goal is', 'my objective is',
      'to answer this', 'to help with this', 'to complete this', 'to accomplish this',
      'breaking this down', 'analyzing this', 'processing this', 'examining this',
      'okay, so', 'alright, so', 'so i need', 'now i need', 'first i need',
      'i\'ll need to', 'i will need to', 'i have to', 'i\'m going to',
    ];
    
    for (const phrase of thoughtPhrases) {
      if (trimmed.includes(phrase)) {
        return false;
      }
    }
    
    return true;
  });
  
  cleaned = filteredParagraphs.join('\n\n');
  
  // Remove lines that start with thought patterns
  const lines = cleaned.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed) return true;
    
    const lineStartPatterns = [
      /^i (need to|should|must|will|have to|want to|am going to|'ll|would)/i,
      /^let me/i,
      /^(thinking|analyzing|processing|considering|examining|reviewing)/i,
      /^the user/i,
      /^user('s| is| wants| says| asked| needs)/i,
      /^(based on|from the)/i,
      /^(my response|i'll respond|i should respond|i must respond)/i,
      /^(first,? i|step \d+:|internally)/i,
      /^(reasoning:|thought:|internal:|analysis:|reflection:|plan:|strategy:|approach:)/i,
      /^(as an ai|as a language model|as an assistant)/i,
      /^(now i|next i|to do this|to complete this|to answer this)/i,
      /^(looking at|examining|reading|breaking)/i,
      /^(okay,? so|alright,? so|so,? i need)/i,
      /^(here's what|here is what|what i)/i,
    ];
    
    for (const pattern of lineStartPatterns) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }
    
    return true;
  });
  
  cleaned = filteredLines.join('\n');
  
  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  
  return cleaned;
};

interface ChatMessageProps {
  msg: Message;
  isThinking: boolean;
  isAutoMode: boolean;
  isLast: boolean;
  copiedMessageId: string | null;
  handleCopy: (text: string, id: string) => void;
  handleRegenerate: (targetId?: string) => void;
  automationPlan: { title: string; steps: AutomationStep[] } | null;
  isExecutingAutomation: boolean;
  setIsExecutingAutomation: (executing: boolean) => void;
  agentConnected: boolean;
  onScreenshotCaptured?: (screenshot: CapturedScreenshot, stepId: string) => void;
}

const CopyableTable = ({ node, ...props }: any) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyTable = async () => {
    if (!tableRef.current) return;
    
    let tableText = "";
    const rows = tableRef.current.querySelectorAll("tr");
    
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll("th, td");
      const cellTexts: string[] = [];
      cells.forEach(cell => {
        cellTexts.push(cell.textContent?.trim() || "");
      });
      tableText += cellTexts.join("\t") + (rowIndex < rows.length - 1 ? "\n" : "");
    });

    try {
      await navigator.clipboard.writeText(tableText);
      setIsCopied(true);
      toast.success("Table copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy table");
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-gray-200 shadow-sm bg-white">
      <div className="absolute right-2 top-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-white shadow-sm border border-gray-200 hover:bg-gray-50"
          onClick={handleCopyTable}
          title="Copy table to clipboard"
        >
          {isCopied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <ClipboardCopy className="h-4 w-4 text-gray-500" />
          )}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="min-w-full divide-y divide-gray-200" {...props} />
      </div>
    </div>
  );
};

export const ChatMessage = memo(function ChatMessage({
  msg,
  isThinking,
  isAutoMode,
  isLast,
  copiedMessageId,
  handleCopy,
  handleRegenerate,
  automationPlan,
  isExecutingAutomation,
  setIsExecutingAutomation,
  agentConnected,
  onScreenshotCaptured
}: ChatMessageProps) {
  const markdownComponents = useMemo(() => ({
    table: CopyableTable,
    thead: ({ node, ...props }: any) => <thead className="bg-gray-50" {...props} />,
    th: ({ node, ...props }: any) => <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b" {...props} />,
    td: ({ node, ...props }: any) => <td className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100 last:border-b-0" {...props} />,
    p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0" {...props} />,
    strong: ({ node, ...props }: any) => <strong className="font-bold text-black" {...props} />,
    code: ({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const isPlan = match && match[1] === 'automation-plan';
        
        // Always hide automation-plan code blocks (they render as AutomationTodoList instead)
        if (isPlan) {
          return null;
        }
        
        // Hide all non-inline code blocks (both in chat mode and auto mode)
        if (!inline) {
          return null;
        }
        
        // Only show inline code
        return (
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-nova-pink font-mono text-[0.9em]" {...props}>
            {children}
          </code>
        );
      },
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 mb-3" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-4 mb-3" {...props} />,
    li: ({ node, ...props }: any) => <li className="mb-1" {...props} />,
    h1: ({ node, ...props }: any) => <h1 className="text-xl font-bold mb-4 mt-6 text-black border-b pb-2" {...props} />,
    h2: ({ node, ...props }: any) => <h2 className="text-lg font-bold mb-3 mt-5 text-black" {...props} />,
    h3: ({ node, ...props }: any) => <h3 className="text-md font-bold mb-2 mt-4 text-black" {...props} />,
    blockquote: ({ node, ...props }: any) => (
      <blockquote className="border-l-4 border-nova-pink/30 pl-4 py-1 my-4 italic text-gray-600 bg-nova-pink/5 rounded-r-lg" {...props} />
    ),
  }), [isAutoMode]);

  return (
    <div className={`flex w-full ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
      {msg.isUser ? (
        <div className="max-w-[70%] p-4 rounded-2xl bg-white text-black border border-gray-200 shadow-sm">
          {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {msg.attachments.map((attachment, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {attachment.type.startsWith('image') ? (
                    <img src={attachment.preview} alt={attachment.name} className="w-20 h-20 object-cover rounded-lg" />
                  ) : (
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-2 py-1">
                      <span className="text-xs">{attachment.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col gap-2">
          {isThinking && isLast && !msg.text && (
            <div className="flex items-center gap-2 mb-1">
              {isAutoMode ? (
                <>
                  <div className="flex items-center justify-center animate-pulse text-base">🛠️</div>
                  <span className="text-sm text-gray-400 font-medium animate-pulse">preparing automation plan...</span>
                </>
              ) : (
                <>
                  <Brain size={16} className="animate-pulse" style={{ color: 'black' }} />
                  <span className="text-sm text-gray-400 font-medium animate-pulse">thinking...</span>
                </>
              )}
            </div>
          )}
          
{msg.text && (
              <div className="text-black text-base leading-relaxed max-w-[85%] break-words">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents as any}
                >
                  {cleanAIThoughts(msg.text)}
                </ReactMarkdown>
              </div>
            )}
          
            {isLast && automationPlan && isAutoMode && !isThinking && (
              <div className="mt-4">
                <AutomationTodoList 
                  title={automationPlan.title}
                  steps={automationPlan.steps}
                  isExecuting={isExecutingAutomation}
                  onStart={() => setIsExecutingAutomation(true)}
                  onStop={() => setIsExecutingAutomation(false)}
                  agentConnected={agentConnected}
                  onScreenshotCaptured={onScreenshotCaptured}
                />
              </div>
            )}

          {(!isThinking || !isLast) && msg.text && (
            <div className="flex items-center gap-1 mt-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-black hover:bg-gray-100" onClick={() => handleCopy(msg.text, msg.id)}>
                {copiedMessageId === msg.id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-black hover:bg-gray-100" onClick={() => handleRegenerate(msg.id)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
          </div>
        )}
      </div>
    );
});
