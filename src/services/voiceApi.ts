/// <reference types="vite/client" />
import type { Task } from '../types/task';

// In local development with Vite proxy, VITE_API_BASE_URL is usually empty.
// In production without proxy, this points to the external backend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface TranscribeResponse {
  transcript: string;
  draft: Partial<Task>;
  error?: string;
}

/**
 * Validates if the Voice Task backend is properly configured for the current environment.
 * Prevents the application from crashing or making broken requests in production GitHub Pages
 * if the backend environment variable is missing.
 */
export const isVoiceBackendConfigured = (): boolean => {
  // Local development relies on Vite's proxy resolving relative paths, so it's safely configured.
  if (import.meta.env.DEV) {
    return true;
  }
  // Production requires an explicitly set VITE_API_BASE_URL.
  return !!import.meta.env.VITE_API_BASE_URL;
};

/**
 * Sends the recorded audio blob to the backend transcription service.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<TranscribeResponse> => {
  if (!isVoiceBackendConfigured()) {
    throw new Error('Voice Task backend is not configured for this environment.');
  }

  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  
  // Add an optional language hint for better transcription accuracy
  const lang = navigator.language ? navigator.language.split('-')[0] : 'en';
  formData.append('language', lang);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/voice-task/transcribe`, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    // Catch fetch/network errors (e.g., backend offline, CORS failure)
    throw new Error('Network error: Unable to reach the Voice Task backend. It may be offline.');
  }

  if (!response.ok) {
    let errorMessage = `Server error: ${response.status}`;
    try {
      // Attempt to parse structured error message if provided by backend
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Fallback if the error is not JSON (e.g. standard 404 or 502 HTML page)
      if (response.status === 404) {
        errorMessage = 'Voice API endpoint not found. The backend may be misconfigured.';
      } else if (response.status >= 500) {
        errorMessage = 'Internal backend server error. Please try again later.';
      }
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }

  return data;
};
