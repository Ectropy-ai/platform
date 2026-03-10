/**
 * Client-Side Analytics Tracking - Task 5.3
 * Lightweight tracking script for web dashboard
 * Automatically tracks user interactions and page views
 */

interface EctropyAnalyticsConfig {
  apiEndpoint: string;
  sessionId: string;
  userId?: string;
  enableAutoTracking: boolean;
  trackingEvents: string[];
  performanceTracking: boolean;
  debugMode: boolean;
}

interface TrackingEvent {
  eventType: 'conversion' | 'interaction' | 'performance' | 'live';
  sessionId: string;
  userId?: string;
  metadata: Record<string, any>;
}

class EctropyAnalytics {
  private config: EctropyAnalyticsConfig;
  private eventQueue: TrackingEvent[] = [];
  private isInitialized = false;
  private sessionStartTime = Date.now();
  private lastActivity = Date.now();
  private pageStartTime = Date.now();

  constructor(config: Partial<EctropyAnalyticsConfig>) {
    this.config = {
      apiEndpoint: '/api/analytics',
      sessionId: this.generateSessionId(),
      enableAutoTracking: true,
      trackingEvents: ['click', 'submit', 'scroll', 'pageview'],
      performanceTracking: true,
      debugMode: false,
      ...config,
    };

    this.initialize();
  }

  /**
   * Initialize analytics tracking
   */
  private initialize(): void {
    if (this.isInitialized) return;

    // Track page load performance
    if (this.config.performanceTracking) {
      this.trackPageLoadPerformance();
    }

    // Set up auto-tracking
    if (this.config.enableAutoTracking) {
      this.setupAutoTracking();
    }

    // Track initial page view
    this.trackPageView();

    // Set up session activity tracking
    this.setupActivityTracking();

    // Flush events periodically
    setInterval(() => this.flushEvents(), 5000); // Every 5 seconds

    // Flush events before page unload
    window.addEventListener('beforeunload', () => {
      this.trackSessionEnd();
      this.flushEvents();
    });

    this.isInitialized = true;
    this.log('Analytics initialized');
  }

  /**
   * Track conversion event
   */
  public trackConversion(conversionType: string, metadata: Record<string, any> = {}): void {
    this.addEvent({
      eventType: 'conversion',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      metadata: {
        conversionType,
        timestamp: Date.now(),
        ...metadata,
      },
    });
  }

  /**
   * Track user interaction
   */
  public trackInteraction(
    interactionType: string,
    elementId: string,
    metadata: Record<string, any> = {},
  ): void {
    this.addEvent({
      eventType: 'interaction',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      metadata: {
        interactionType,
        elementId,
        elementType: this.getElementType(elementId),
        pageUrl: window.location.href,
        pageTitle: document.title,
        timestamp: Date.now(),
        coordinates: metadata.coordinates,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        ...metadata,
      },
    });
  }

  /**
   * Track performance metric
   */
  public trackPerformance(
    metricType: string,
    value: number,
    metadata: Record<string, any> = {},
  ): void {
    this.addEvent({
      eventType: 'performance',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      metadata: {
        metricType,
        value,
        timestamp: Date.now(),
        ...metadata,
      },
    });
  }

  /**
   * Track custom event
   */
  public track(eventName: string, properties: Record<string, any> = {}): void {
    this.addEvent({
      eventType: 'live',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      metadata: {
        eventType: eventName,
        ...properties,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Set user ID for session
   */
  public setUserId(userId: string): void {
    this.config.userId = userId;
    this.track('user_identified', { userId });
  }

  /**
   * Track page view
   */
  public trackPageView(pageName?: string): void {
    const pageData = {
      page: pageName || window.location.pathname,
      title: document.title,
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
    };

    this.trackConversion('landing_page_view', pageData);
    this.pageStartTime = Date.now();
  }

  /**
   * Set up automatic event tracking
   */
  private setupAutoTracking(): void {
    // Track clicks
    if (this.config.trackingEvents.includes('click')) {
      document.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        if (target && target.id) {
          this.trackInteraction('click', target.id, {
            coordinates: { x: event.clientX, y: event.clientY },
            feature: target.dataset.feature || target.className,
          });
        }
      });
    }

    // Track form submissions
    if (this.config.trackingEvents.includes('submit')) {
      document.addEventListener('submit', event => {
        const target = event.target as HTMLFormElement;
        if (target && target.id) {
          this.trackInteraction('form_submit', target.id, {
            action: target.action,
            method: target.method,
          });
        }
      });
    }

    // Track scroll depth
    if (this.config.trackingEvents.includes('scroll')) {
      let maxScrollDepth = 0;
      let scrollTimeout: number;

      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => {
          const scrollDepth = Math.round(
            (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100,
          );

          if (scrollDepth > maxScrollDepth) {
            maxScrollDepth = scrollDepth;
            this.trackInteraction('scroll', 'page', {
              scrollDepth,
              scrollPosition: { x: window.scrollX, y: window.scrollY },
            });
          }
        }, 250);
      });
    }

    // Track demo-specific interactions
    this.setupDemoTracking();
  }

  /**
   * Set up demo-specific tracking
   */
  private setupDemoTracking(): void {
    // Track demo button clicks
    document.addEventListener('click', event => {
      const target = event.target as HTMLElement;

      if (target.matches('[data-demo-action]')) {
        const action = target.dataset.demoAction;
        this.trackConversion('demo_request_initiated', {
          button: target.id,
          action,
          feature: 'demo_request',
        });
      }

      if (target.matches('[data-stakeholder-role]')) {
        const role = target.dataset.stakeholderRole;
        this.trackConversion('stakeholder_role_switched', {
          previousRole: document
            .querySelector('[data-current-role]')
            ?.getAttribute('data-current-role'),
          newRole: role,
          feature: 'stakeholder_switch',
        });
      }

      if (target.matches('[data-ai-agent]')) {
        this.trackConversion('ai_agent_interaction', {
          agent: target.dataset.aiAgent,
          query: target.dataset.query || 'unknown',
          feature: 'ai_agent_query',
        });
      }
    });

    // Track trial signup
    document.addEventListener('submit', event => {
      const target = event.target as HTMLFormElement;

      if (target.matches('[data-signup-form]')) {
        this.trackConversion('trial_signup_conversion', {
          form: target.id,
          feature: 'trial_signup',
        });
      }
    });
  }

  /**
   * Set up session activity tracking
   */
  private setupActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    events.forEach(eventType => {
      document.addEventListener(
        eventType,
        () => {
          this.lastActivity = Date.now();
        },
        { passive: true },
      );
    });

    // Track session duration periodically
    setInterval(() => {
      const sessionDuration = Date.now() - this.sessionStartTime;
      const timeSinceActivity = Date.now() - this.lastActivity;

      // Only track if user has been active recently (less than 5 minutes)
      if (timeSinceActivity < 5 * 60 * 1000) {
        this.trackPerformance('session_duration', sessionDuration, {
          timeSinceActivity,
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Track page load performance
   */
  private trackPageLoadPerformance(): void {
    window.addEventListener('load', () => {
      // Wait a bit for all resources to load
      setTimeout(() => {
        const perfData = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;

        if (perfData) {
          this.trackPerformance('page_load_time', perfData.loadEventEnd - perfData.fetchStart, {
            domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
            firstPaint: this.getFirstPaint(),
            firstContentfulPaint: this.getFirstContentfulPaint(),
          });
        }

        // Track Core Web Vitals
        this.trackCoreWebVitals();
      }, 1000);
    });
  }

  /**
   * Track Core Web Vitals
   */
  private trackCoreWebVitals(): void {
    // LCP (Largest Contentful Paint)
    if ('PerformanceObserver' in window) {
      new PerformanceObserver(entryList => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.trackPerformance('largest_contentful_paint', lastEntry.startTime);
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // FID (First Input Delay)
      new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          const fidEntry = entry as any; // PerformanceEventTiming
          if (fidEntry.processingStart) {
            this.trackPerformance(
              'first_input_delay',
              fidEntry.processingStart - fidEntry.startTime,
            );
          }
        }
      }).observe({ entryTypes: ['first-input'] });

      // CLS (Cumulative Layout Shift)
      let clsValue = 0;
      new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        this.trackPerformance('cumulative_layout_shift', clsValue);
      }).observe({ entryTypes: ['layout-shift'] });
    }
  }

  /**
   * Track session end
   */
  private trackSessionEnd(): void {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const pageViews = this.eventQueue.filter(
      e => e.eventType === 'conversion' && e.metadata.conversionType === 'landing_page_view',
    ).length;

    this.trackInteraction('session_exit', 'page', {
      sessionDuration,
      pageViews,
      totalEvents: this.eventQueue.length,
    });
  }

  /**
   * Get first paint timing
   */
  private getFirstPaint(): number {
    const paintEntries = performance.getEntriesByType('paint');
    const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
    return firstPaint ? firstPaint.startTime : 0;
  }

  /**
   * Get first contentful paint timing
   */
  private getFirstContentfulPaint(): number {
    const paintEntries = performance.getEntriesByType('paint');
    const firstContentfulPaint = paintEntries.find(
      entry => entry.name === 'first-contentful-paint',
    );
    return firstContentfulPaint ? firstContentfulPaint.startTime : 0;
  }

  /**
   * Get element type from element ID
   */
  private getElementType(elementId: string): string {
    const element = document.getElementById(elementId);
    return element ? element.tagName.toLowerCase() : 'unknown';
  }

  /**
   * Add event to queue
   */
  private addEvent(event: TrackingEvent): void {
    this.eventQueue.push(event);
    this.log('Event added:', event);

    // Flush immediately for important events
    if (event.eventType === 'conversion') {
      this.flushEvents();
    }
  }

  /**
   * Flush events to server
   */
  private flushEvents(): void {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    // Send events in batches
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      this.sendEvents(batch);
    }
  }

  /**
   * Send events to server
   */
  private async sendEvents(events: TrackingEvent[]): Promise<void> {
    try {
      for (const event of events) {
        await fetch(`${this.config.apiEndpoint}/track/event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
          keepalive: true,
        });
      }

      this.log(`Sent ${events.length} events to server`);
    } catch (error) {
      this.log('Failed to send events:', error);
      // Re-queue events for retry
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `ectropy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log debug messages
   */
  private log(...args: any[]): void {
    if (this.config.debugMode) {
    }
  }
}

// Create global analytics instance
declare global {
  interface Window {
    EctropyAnalytics: typeof EctropyAnalytics;
    ectropy: EctropyAnalytics;
  }
}

// Initialize analytics when script loads
if (typeof window !== 'undefined') {
  window.EctropyAnalytics = EctropyAnalytics;

  // Auto-initialize with default config
  window.ectropy = new EctropyAnalytics({
    debugMode: process.env.NODE_ENV === 'development',
  });
}

export default EctropyAnalytics;
