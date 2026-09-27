import { createContext, useContext } from 'react';
import type { DrawioController } from './DrawioController';

export const DrawioControllerContext = createContext<DrawioController | null>(null);

export function useDrawioController(): DrawioController | null {
  return useContext(DrawioControllerContext);
}
