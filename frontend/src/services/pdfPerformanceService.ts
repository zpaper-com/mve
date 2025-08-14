/**
 * PDF Performance Service - Advanced performance optimizations
 * 
 * This service provides virtual scrolling, memory management, progressive rendering,
 * and other performance optimizations for large PDF documents.
 */

import type { 
  PDFDocumentProxy, 
  PDFPageProxy, 
  RenderTask,
  PageViewport 
} from 'pdfjs-dist';

import type {
  PDFMemoryStats,
  PDFRenderOptions,
  PDFPageRenderInfo,
  PDFViewerConfig,
} from '../types/pdf';

import { logger } from '../utils/logger';

interface VirtualScrollItem {
  index: number;
  pageNumber: number;
  top: number;
  height: number;
  visible: boolean;
  rendered: boolean;
}

interface RenderQueue {
  pageNumber: number;
  priority: number;
  scale: number;
  renderOptions: PDFRenderOptions;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (error: Error) => void;
}

/**
 * PDF Performance Service
 */
export class PDFPerformanceService {
  private pdfDocument: PDFDocumentProxy | null = null;
  private config: PDFViewerConfig;
  private memoryStats: PDFMemoryStats = {
    totalMemory: 0,
    usedMemory: 0,
    cacheSize: 0,
    pageCount: 0,
    renderedPages: 0,
    activeTasks: 0,
  };

  // Rendering management
  private renderQueue: RenderQueue[] = [];
  private activeRenderTasks = new Map<number, RenderTask>();
  private pageCache = new Map<string, PDFPageRenderInfo>();
  private thumbnailCache = new Map<number, string>();
  
  // Virtual scrolling
  private virtualScrollItems: VirtualScrollItem[] = [];
  private viewportHeight = 0;
  private scrollTop = 0;
  private itemHeight = 800; // Default page height
  private bufferSize = 2; // Pages to render outside viewport
  
  // Memory management
  private maxCacheSize = 100 * 1024 * 1024; // 100MB default
  private maxRenderedPages = 10;
  private cleanupThreshold = 0.8; // Cleanup when 80% of max cache is used
  
  // Performance monitoring
  private renderTimes: number[] = [];
  private memoryCheckInterval: number | null = null;

  constructor(config: PDFViewerConfig) {
    this.config = config;
    this.maxCacheSize = config.canvasMaxAreaInBytes || this.maxCacheSize;
    this.startMemoryMonitoring();
  }

  /**
   * Initialize with PDF document
   */
  async initialize(pdfDocument: PDFDocumentProxy): Promise<void> {
    this.pdfDocument = pdfDocument;
    this.memoryStats.pageCount = pdfDocument.numPages;
    
    // Pre-calculate page dimensions for virtual scrolling
    await this.calculatePageDimensions();
    
    logger.info('PDF Performance Service initialized', {
      pages: pdfDocument.numPages,
      maxCacheSize: this.maxCacheSize,
    });
  }

  /**
   * Calculate dimensions for all pages (for virtual scrolling)
   */
  private async calculatePageDimensions(): Promise<void> {
    if (!this.pdfDocument) return;

    this.virtualScrollItems = [];
    let currentTop = 0;

    // Sample first few pages to estimate dimensions
    const sampleSize = Math.min(3, this.pdfDocument.numPages);
    const sampleHeights: number[] = [];

    for (let i = 1; i <= sampleSize; i++) {
      try {
        const page = await this.pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        sampleHeights.push(viewport.height);
      } catch (error) {
        logger.warn(`Failed to get dimensions for page ${i}:`, error);
        sampleHeights.push(this.itemHeight);
      }
    }

    // Use average height as default
    this.itemHeight = sampleHeights.reduce((a, b) => a + b, 0) / sampleHeights.length;

    // Create virtual scroll items
    for (let i = 1; i <= this.pdfDocument.numPages; i++) {
      const height = i <= sampleSize ? sampleHeights[i - 1] : this.itemHeight;
      
      this.virtualScrollItems.push({
        index: i - 1,
        pageNumber: i,
        top: currentTop,
        height,
        visible: false,
        rendered: false,
      });
      
      currentTop += height + 10; // 10px margin between pages
    }
  }

  /**
   * Update virtual scroll viewport
   */
  updateViewport(scrollTop: number, viewportHeight: number): VirtualScrollItem[] {
    this.scrollTop = scrollTop;
    this.viewportHeight = viewportHeight;

    // Calculate visible items with buffer
    const visibleItems: VirtualScrollItem[] = [];
    const startBuffer = scrollTop - (this.bufferSize * this.itemHeight);
    const endBuffer = scrollTop + viewportHeight + (this.bufferSize * this.itemHeight);

    this.virtualScrollItems.forEach(item => {
      const itemTop = item.top;
      const itemBottom = item.top + item.height;
      
      const wasVisible = item.visible;
      item.visible = itemBottom >= startBuffer && itemTop <= endBuffer;
      
      if (item.visible) {
        visibleItems.push(item);
        
        // Queue for rendering if not already rendered
        if (!item.rendered) {
          this.queuePageRender(item.pageNumber, 1, 1.0);
        }
      } else if (wasVisible) {
        // Page is no longer visible - consider for cleanup
        this.schedulePageCleanup(item.pageNumber);
      }
    });

    return visibleItems;
  }

  /**
   * Queue page for rendering with priority
   */
  async queuePageRender(
    pageNumber: number, 
    priority: number, 
    scale: number = 1.0,
    renderOptions?: Partial<PDFRenderOptions>
  ): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const cacheKey = this.getCacheKey(pageNumber, scale);
      
      // Check cache first
      const cached = this.pageCache.get(cacheKey);
      if (cached && cached.canvas) {
        resolve(cached.canvas);
        return;
      }

      // Add to render queue
      const queueItem: RenderQueue = {
        pageNumber,
        priority,
        scale,
        renderOptions: { scale, ...renderOptions },
        resolve,
        reject,
      };

      this.renderQueue.push(queueItem);
      this.renderQueue.sort((a, b) => b.priority - a.priority); // Higher priority first
      
      this.processRenderQueue();
    });
  }

  /**
   * Process render queue
   */
  private async processRenderQueue(): Promise<void> {
    if (this.activeRenderTasks.size >= this.config.maxCanvasPixels || this.renderQueue.length === 0) {
      return;
    }

    const item = this.renderQueue.shift();
    if (!item) return;

    try {
      const canvas = await this.renderPage(item.pageNumber, item.renderOptions);
      this.updateVirtualScrollItem(item.pageNumber, true);
      item.resolve(canvas);
    } catch (error) {
      logger.error(`Failed to render page ${item.pageNumber}:`, error);
      item.reject(error as Error);
    }

    // Continue processing queue
    if (this.renderQueue.length > 0) {
      requestIdleCallback(() => this.processRenderQueue());
    }
  }

  /**
   * Render individual page
   */
  private async renderPage(
    pageNumber: number, 
    renderOptions: PDFRenderOptions
  ): Promise<HTMLCanvasElement> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    const startTime = performance.now();
    const cacheKey = this.getCacheKey(pageNumber, renderOptions.scale);
    
    try {
      // Check if already rendering
      if (this.activeRenderTasks.has(pageNumber)) {
        throw new Error(`Page ${pageNumber} is already rendering`);
      }

      const page = await this.pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ 
        scale: renderOptions.scale,
        rotation: renderOptions.rotation || 0
      });

      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Set up render context
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        background: renderOptions.background,
        enableWebGL: false, // Disable WebGL for better compatibility
      };

      // Start rendering
      const renderTask = page.render(renderContext);
      this.activeRenderTasks.set(pageNumber, renderTask);
      this.memoryStats.activeTasks++;

      await renderTask.promise;

      // Cache the rendered page
      const renderInfo: PDFPageRenderInfo = {
        pageNumber,
        scale: renderOptions.scale,
        rotation: renderOptions.rotation || 0,
        viewport,
        canvas,
        renderTask,
        timestamp: Date.now(),
        memorySize: this.estimateCanvasMemory(canvas),
      };

      this.cacheRenderedPage(cacheKey, renderInfo);
      
      // Update stats
      const renderTime = performance.now() - startTime;
      this.renderTimes.push(renderTime);
      this.memoryStats.renderedPages++;
      
      // Keep only last 100 render times
      if (this.renderTimes.length > 100) {
        this.renderTimes.shift();
      }

      logger.debug(`Rendered page ${pageNumber} in ${renderTime.toFixed(2)}ms`);
      
      return canvas;
      
    } catch (error) {
      logger.error(`Failed to render page ${pageNumber}:`, error);
      throw error;
    } finally {
      this.activeRenderTasks.delete(pageNumber);
      this.memoryStats.activeTasks--;
    }
  }

  /**
   * Cache rendered page
   */
  private cacheRenderedPage(cacheKey: string, renderInfo: PDFPageRenderInfo): void {
    // Check memory limits
    if (this.memoryStats.cacheSize + renderInfo.memorySize > this.maxCacheSize) {
      this.cleanupCache();
    }

    this.pageCache.set(cacheKey, renderInfo);
    this.memoryStats.cacheSize += renderInfo.memorySize;
    this.memoryStats.usedMemory = this.estimateTotalMemory();
  }

  /**
   * Clean up cache when memory limit is reached
   */
  private cleanupCache(): void {
    const entries = Array.from(this.pageCache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
    
    // Remove oldest entries until we're under threshold
    const targetSize = this.maxCacheSize * this.cleanupThreshold;
    
    while (this.memoryStats.cacheSize > targetSize && entries.length > 0) {
      const [key, renderInfo] = entries.shift()!;
      this.pageCache.delete(key);
      this.memoryStats.cacheSize -= renderInfo.memorySize;
      
      // Update virtual scroll item
      this.updateVirtualScrollItem(renderInfo.pageNumber, false);
    }

    logger.debug('Cache cleanup completed', {
      remainingEntries: this.pageCache.size,
      cacheSize: this.memoryStats.cacheSize,
    });
  }

  /**
   * Schedule page cleanup (delayed)
   */
  private schedulePageCleanup(pageNumber: number): void {
    // Cleanup after a delay to avoid re-rendering if user scrolls back quickly
    setTimeout(() => {
      const cacheKeys = Array.from(this.pageCache.keys()).filter(key => 
        key.startsWith(`${pageNumber}-`)
      );
      
      cacheKeys.forEach(key => {
        const renderInfo = this.pageCache.get(key);
        if (renderInfo) {
          this.pageCache.delete(key);
          this.memoryStats.cacheSize -= renderInfo.memorySize;
        }
      });
      
      if (cacheKeys.length > 0) {
        this.updateVirtualScrollItem(pageNumber, false);
        logger.debug(`Cleaned up page ${pageNumber} from cache`);
      }
    }, 5000); // 5 second delay
  }

  /**
   * Update virtual scroll item status
   */
  private updateVirtualScrollItem(pageNumber: number, rendered: boolean): void {
    const item = this.virtualScrollItems.find(item => item.pageNumber === pageNumber);
    if (item) {
      item.rendered = rendered;
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(pageNumber: number, scale: number): string {
    return `${pageNumber}-${scale.toFixed(2)}`;
  }

  /**
   * Estimate canvas memory usage
   */
  private estimateCanvasMemory(canvas: HTMLCanvasElement): number {
    // Each pixel uses 4 bytes (RGBA)
    return canvas.width * canvas.height * 4;
  }

  /**
   * Estimate total memory usage
   */
  private estimateTotalMemory(): number {
    let total = this.memoryStats.cacheSize;
    
    // Add thumbnail cache
    total += this.thumbnailCache.size * 50 * 1024; // Estimate 50KB per thumbnail
    
    // Add overhead for PDF document
    if (this.pdfDocument) {
      total += this.memoryStats.pageCount * 10 * 1024; // Estimate 10KB per page metadata
    }
    
    return total;
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryCheckInterval = window.setInterval(() => {
      this.updateMemoryStats();
      
      // Trigger cleanup if memory usage is high
      if (this.memoryStats.cacheSize > this.maxCacheSize * 0.9) {
        logger.warn('High memory usage detected, triggering cleanup');
        this.cleanupCache();
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Update memory statistics
   */
  private updateMemoryStats(): void {
    this.memoryStats.usedMemory = this.estimateTotalMemory();
    this.memoryStats.totalMemory = this.maxCacheSize;
    
    // Get browser memory info if available
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      this.memoryStats.totalMemory = memInfo.totalJSHeapSize || this.maxCacheSize;
    }
  }

  /**
   * Render thumbnail for page
   */
  async renderThumbnail(pageNumber: number, width: number = 150): Promise<string> {
    const cacheKey = `thumb_${pageNumber}_${width}`;
    
    // Check thumbnail cache
    if (this.thumbnailCache.has(pageNumber)) {
      return this.thumbnailCache.get(pageNumber)!;
    }

    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Calculate scale to fit width
      const scale = width / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Failed to get thumbnail canvas context');
      }

      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;
      
      const imageData = canvas.toDataURL('image/png', 0.8);
      this.thumbnailCache.set(pageNumber, imageData);
      
      return imageData;
      
    } catch (error) {
      logger.error(`Failed to render thumbnail for page ${pageNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    averageRenderTime: number;
    memoryStats: PDFMemoryStats;
    cacheHitRate: number;
    activeRenderTasks: number;
  } {
    const averageRenderTime = this.renderTimes.length > 0 
      ? this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length 
      : 0;

    return {
      averageRenderTime,
      memoryStats: { ...this.memoryStats },
      cacheHitRate: this.pageCache.size / Math.max(1, this.memoryStats.renderedPages),
      activeRenderTasks: this.activeRenderTasks.size,
    };
  }

  /**
   * Cancel all active render tasks
   */
  cancelAllRenderTasks(): void {
    this.activeRenderTasks.forEach((task, pageNumber) => {
      try {
        task.cancel();
      } catch (error) {
        logger.warn(`Failed to cancel render task for page ${pageNumber}:`, error);
      }
    });
    
    this.activeRenderTasks.clear();
    this.renderQueue.length = 0;
    this.memoryStats.activeTasks = 0;
  }

  /**
   * Clear all caches and reset
   */
  reset(): void {
    this.cancelAllRenderTasks();
    this.pageCache.clear();
    this.thumbnailCache.clear();
    this.virtualScrollItems = [];
    this.renderTimes = [];
    
    this.memoryStats = {
      totalMemory: 0,
      usedMemory: 0,
      cacheSize: 0,
      pageCount: 0,
      renderedPages: 0,
      activeTasks: 0,
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.reset();
    
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    
    this.pdfDocument = null;
  }

  /**
   * Get virtual scroll container height
   */
  getTotalHeight(): number {
    if (this.virtualScrollItems.length === 0) return 0;
    
    const lastItem = this.virtualScrollItems[this.virtualScrollItems.length - 1];
    return lastItem.top + lastItem.height;
  }

  /**
   * Get visible pages for current viewport
   */
  getVisiblePages(): number[] {
    return this.virtualScrollItems
      .filter(item => item.visible)
      .map(item => item.pageNumber);
  }

  /**
   * Preload pages around current page
   */
  async preloadPages(currentPage: number, range: number = 2): Promise<void> {
    if (!this.pdfDocument) return;

    const startPage = Math.max(1, currentPage - range);
    const endPage = Math.min(this.pdfDocument.numPages, currentPage + range);

    const preloadPromises: Promise<HTMLCanvasElement>[] = [];

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      if (pageNum !== currentPage) {
        // Lower priority for preloading
        preloadPromises.push(this.queuePageRender(pageNum, 0.5, 1.0));
      }
    }

    try {
      await Promise.allSettled(preloadPromises);
      logger.debug(`Preloaded pages ${startPage}-${endPage} around page ${currentPage}`);
    } catch (error) {
      logger.warn('Some pages failed to preload:', error);
    }
  }
}

// Export singleton-like factory
export const createPDFPerformanceService = (config: PDFViewerConfig): PDFPerformanceService => {
  return new PDFPerformanceService(config);
};

// Export utility functions
export const PDFPerformanceUtils = {
  /**
   * Calculate optimal cache size based on available memory
   */
  calculateOptimalCacheSize: (): number => {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      // Use 10% of available memory for PDF cache
      return Math.floor((memInfo.totalJSHeapSize || 100 * 1024 * 1024) * 0.1);
    }
    
    // Fallback for browsers without memory API
    return 50 * 1024 * 1024; // 50MB
  },

  /**
   * Estimate render time based on page complexity
   */
  estimateRenderTime: (pageWidth: number, pageHeight: number, scale: number): number => {
    const pixels = pageWidth * pageHeight * scale * scale;
    // Rough estimate: 0.001ms per 1000 pixels
    return Math.max(100, pixels * 0.001 / 1000);
  },

  /**
   * Check if virtual scrolling should be enabled
   */
  shouldUseVirtualScrolling: (pageCount: number): boolean => {
    return pageCount > 10; // Enable for documents with more than 10 pages
  },

  /**
   * Get optimal thumbnail size based on viewport
   */
  getOptimalThumbnailSize: (containerWidth: number): number => {
    return Math.max(100, Math.min(200, Math.floor(containerWidth * 0.15)));
  },
};