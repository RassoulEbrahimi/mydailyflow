import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, X, Loader2 } from 'lucide-react';
import type { Task } from '../types/task';
import { transcribeAudio, isVoiceBackendConfigured } from '../services/voiceApi';

interface VoiceTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (draft: Partial<Task>) => void;
}

export default function VoiceTaskModal({ isOpen, onClose, onSuccess }: VoiceTaskModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      setError(null);
      setRecordingTime(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    setError(null);
    setRecordingTime(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const type = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach(track => track.stop());
        
        if (chunksRef.current.length > 0) {
          await processAudio(audioBlob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setError('Microphone access denied. Please grant permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCancel = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Clear chunks so onstop doesn't process
      chunksRef.current = [];
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    onClose();
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);
    try {
      const data = await transcribeAudio(audioBlob);

      // Success, pass draft to parent
      const { draft } = data;
      onSuccess(draft);
      onClose(); // Close voice modal
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError(err.message || 'Failed to process audio.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleCancel}
      />

      <div
        className={`fixed bottom-0 left-0 w-full bg-[#141923] rounded-t-[2rem] z-50 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col p-6 pb-safe border-t border-[#232f48]/50 shadow-2xl ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 bg-[#2a364f] rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold text-[18px]">Voice Task</h2>
          <button onClick={handleCancel} className="text-[#6f89b0] hover:text-white p-1" disabled={isProcessing}>
            <X size={22} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
            <p className="text-red-400 text-[13px] text-center">{error}</p>
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-6 h-40">
          {!isVoiceBackendConfigured() ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-1">
                <Mic size={24} className="text-red-400 opacity-50" />
              </div>
              <div>
                <p className="text-white font-semibold text-[15px] mb-1">Voice Setup Incomplete</p>
                <p className="text-[#6f89b0] text-[13px] px-4">
                  The backend service is not configured for this environment.
                </p>
              </div>
            </div>
          ) : isProcessing ? (
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <Loader2 size={40} className="text-primary animate-spin" />
              <p className="text-[#6f89b0] text-[15px] font-medium">Preparing task...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isRecording 
                    ? 'bg-red-500/20 text-red-500 scale-110 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                    : 'bg-primary text-white shadow-[0_0_20px_rgba(19,91,236,0.4)] hover:bg-blue-600'
                }`}
              >
                {isRecording ? <Square size={28} fill="currentColor" /> : <Mic size={32} />}
                {isRecording && (
                  <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75" />
                )}
              </button>
              
              <div className="text-center flex flex-col items-center">
                <p className="text-white font-semibold text-[16px] mb-1">
                  {isRecording ? `Recording... 0:${recordingTime.toString().padStart(2, '0')}` : 'Tap to speak'}
                </p>
                <p className="text-[#6f89b0] text-[13px] mb-2">
                  e.g. "Buy protein shake tomorrow"
                </p>
                <span className="text-[11px] text-[#6f89b0]/80 bg-[#2a364f]/50 px-2 py-0.5 rounded-md font-medium">
                  Optimized for German
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
