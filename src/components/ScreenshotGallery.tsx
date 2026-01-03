import { useState, useEffect } from 'react';
import {
  getScreenshots,
  ExecutionScreenshot,
} from '../lib/screenshotStorage';

interface ScreenshotGalleryProps {
  userEmail: string;
  sessionId?: string;
  limit?: number;
}

export function ScreenshotGallery({ userEmail, sessionId, limit = 20 }: ScreenshotGalleryProps) {
  const [screenshots, setScreenshots] = useState<ExecutionScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) {
      setLoading(false);
      return;
    }
    
    const loadScreenshots = async () => {
      const data = await getScreenshots(userEmail, sessionId, limit);
      setScreenshots(data);
      setLoading(false);
    };

    loadScreenshots();
  }, [userEmail, sessionId, limit]);

  const getStateColor = (state: ExecutionScreenshot['execution_state']) => {
    switch (state) {
      case 'completed': return 'bg-emerald-500';
      case 'failed': return 'bg-red-500';
      case 'in_progress': return 'bg-amber-500';
      default: return 'bg-zinc-500';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse bg-zinc-800 rounded-lg aspect-video" />
        ))}
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p>No screenshots captured yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {screenshots.map((screenshot) => (
          <div
            key={screenshot.id}
            className="group relative bg-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-violet-500 transition-all"
            onClick={() => setSelectedImage(screenshot.screenshot_url)}
          >
            <img
              src={screenshot.screenshot_url}
              alt={screenshot.task_description || 'Execution screenshot'}
              className="w-full aspect-video object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${getStateColor(screenshot.execution_state)}`} />
                  <span className="text-xs text-zinc-300 capitalize">{screenshot.execution_state}</span>
                </div>
                {screenshot.task_description && (
                  <p className="text-sm text-zinc-200 line-clamp-2">{screenshot.task_description}</p>
                )}
                <p className="text-xs text-zinc-400 mt-1">{formatDate(screenshot.created_at)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-zinc-300"
            onClick={() => setSelectedImage(null)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={selectedImage}
            alt="Full size screenshot"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
