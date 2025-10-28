import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Only show prompt if not in standalone mode
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false);
    }

    // Handle iOS "Add to Home Screen"
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && !window.navigator.standalone) {
      setShowPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // For iOS, show native "Add to Home Screen" instruction
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        alert('To install CineOracle:\n\n1. Tap the Share button\n2. Select "Add to Home Screen"\n3. Tap "Add" to confirm');
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('Error installing PWA:', error);
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={handleInstall}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
      >
        <Download className="w-5 h-5" />
        <span>Install App</span>
      </button>
    </div>
  );
}