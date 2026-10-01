import type { MyBookApi } from '../preload/api'

declare global {
  interface Window {
    mybook: MyBookApi
  }
}

export {}
