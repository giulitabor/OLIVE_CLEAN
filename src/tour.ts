/**
 * OliviumTour - Professional Guided Onboarding
 * Logic: Creates a focused overlay, highlights active elements, and manages tab flow.
 */
export class OliviumTour {
    private currentStep = 0;
    private overlay: HTMLElement | null = null;
    private modal: HTMLElement | null = null;
    private highlightBox: HTMLElement | null = null;

    private steps = [
        {
            target: '#btn-connect',
            title: "1. Identity & Consent",
            content: "Connect your wallet to begin. You will sign a 'Proof of Intent'—confirming you understand these are <b>Living Assets</b>, not digital abstractions.",
            action: "view",
            position: "bottom"
        },
        {
            target: '#nav-tabs',
            title: "2. The Navigation Hub",
            content: "Once connected, use these tabs to move between the <b>Field</b> (Marketplace), your <b>Dashboard</b>, and <b>Rewards</b>.",
            action: "view",
            position: "bottom"
        },
        {
            target: '#trees-grid',
            title: "3. The Living Grove",
            content: "This is the heart of the DAO. Each card is a real tree in Tuscany. Look for the <b>Health Pulse</b> to see real-time soil data.",
            action: () => (window as any).switchTab('home'),
            position: "top"
        },
        {
            target: '#stats',
            title: "4. Impact Tracking",
            content: "Track your collective impact here: Carbon offset, annual oil yield, and the estimated ecosystem value of your grove.",
            action: "view",
            position: "bottom"
        },
        {
            target: '#tab-rewards',
            title: "5. Staking & Yield",
            content: "Finally, navigate to Rewards to stake your shares. Staking unlocks your portion of the SOL revenue pool and harvest invites.",
            action: () => (window as any).switchTab('rewards'),
            position: "left"
        }
    ];

    constructor() {
        this.initElements();
    }

    private initElements() {
        // Create the backdrop overlay
        this.overlay = document.createElement('div');
        Object.assign(this.overlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)', zIndex: '9998', display: 'none', transition: 'all 0.3s'
        });

        // Create the focus/highlight box
        this.highlightBox = document.createElement('div');
        Object.assign(this.highlightBox.style, {
            position: 'absolute', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.7)',
            zIndex: '9999', pointerEvents: 'none', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            border: '2px solid #22c55e'
        });

        // Create the tour modal
        this.modal = document.createElement('div');
        Object.assign(this.modal.style, {
            position: 'fixed', width: '320px', background: 'white', borderRadius: '16px',
            padding: '24px', zIndex: '10000', display: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            fontFamily: 'Inter, sans-serif'
        });

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.highlightBox);
        document.body.appendChild(this.modal);
    }

    public start() {
        this.currentStep = 0;
        this.overlay!.style.display = 'block';
        this.modal!.style.display = 'block';
        this.showStep();
    }

    private showStep() {
        const step = this.steps[this.currentStep];
        const target = document.querySelector(step.target) as HTMLElement;

        if (typeof step.action === 'function') {
            step.action();
        }

        setTimeout(() => {
            if (target) {
                const rect = target.getBoundingClientRect();
                this.updateHighlight(rect);
                this.updateModal(rect, step);
            }
        }, 300); // Allow for tab switching animations
    }

    private updateHighlight(rect: DOMRect) {
        Object.assign(this.highlightBox!.style, {
            top: `${rect.top + window.scrollY - 8}px`,
            left: `${rect.left + window.scrollX - 8}px`,
            width: `${rect.width + 16}px`,
            height: `${rect.height + 16}px`
        });
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    private updateModal(rect: DOMRect, step: any) {
        this.modal!.innerHTML = `
            <h3 class="serif text-lg font-bold text-stone-900 mb-2">${step.title}</h3>
            <p class="text-sm text-stone-600 mb-6 leading-relaxed">${step.content}</p>
            <div class="flex justify-between items-center">
                <button onclick="window.exitTour()" class="text-xs font-bold text-stone-400 hover:text-stone-600">SKIP</button>
                <button onclick="window.nextTourStep()" class="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg shadow-md hover:bg-green-700 transition">
                    ${this.currentStep === this.steps.length - 1 ? 'FINISH' : 'NEXT'}
                </button>
            </div>
        `;

        // Simple positioning logic
        const modalY = rect.bottom + 20;
        const modalX = Math.min(window.innerWidth - 340, Math.max(20, rect.left));
        
        Object.assign(this.modal!.style, {
            top: `${modalY}px`,
            left: `${modalX}px`
        });
    }

    public next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else {
            this.end();
        }
    }

    public end() {
        this.overlay!.style.display = 'none';
        this.modal!.style.display = 'none';
        this.highlightBox!.style.display = 'none';
    }
}

// Global hooks for HTML buttons
const instance = new OliviumTour();
(window as any).startTour = () => instance.start();
(window as any).nextTourStep = () => instance.next();
(window as any).exitTour = () => instance.end();
