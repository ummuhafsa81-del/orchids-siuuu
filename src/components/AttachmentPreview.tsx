import { X, FileText, Music, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Attachment } from "./ChatInput";

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export const AttachmentPreview = ({ attachments, onRemove }: AttachmentPreviewProps) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const renderPreview = (attachment: Attachment) => {
    switch (attachment.type) {
      case 'image':
        return (
          <div className="relative">
            <img
              src={attachment.preview}
              alt={attachment.name}
              className="w-16 h-16 object-cover rounded-lg"
            />
            <Button
              onClick={() => onRemove(attachment.id)}
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );

      case 'video':
        return (
          <div className="relative">
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden">
              {attachment.preview ? (
                <video
                  src={attachment.preview}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <VideoIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <Button
              onClick={() => onRemove(attachment.id)}
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );

      case 'audio':
        return (
          <div className="relative">
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
              <Music className="w-6 h-6 text-gray-500" />
            </div>
            <Button
              onClick={() => onRemove(attachment.id)}
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );

      case 'document':
      default:
        return (
          <div className="relative">
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-500" />
            </div>
            <Button
              onClick={() => onRemove(attachment.id)}
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="flex flex-col items-center">
          {renderPreview(attachment)}
          <div className="mt-1 text-center">
            <p className="text-xs text-gray-600 max-w-16 truncate">
              {attachment.name}
            </p>
            <p className="text-xs text-gray-400">
              {formatFileSize(attachment.size)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};