export class OliviumTour {
    private currentStep = 0;
    private overlay: HTMLElement | null = null;
    private modal: HTMLElement | null = null;

    private steps = [

      // Inside tour.ts -> steps array
      {
          target: '#connectBtn',
          title: "1. Identity & Legal Consent",
          content: `Connect your wallet to begin.
          <br><br>
          <b style="color:#22c55e;">AUDIT NOTE:</b> You will be asked to sign a 'Proof of Intent'. This confirms you understand these trees are <b>Living Assets</b>, not financial instruments. This signature is stored off-chain for regulatory compliance.`,
          action: "click"
      },
        {
            target: '#active-listings',
            title: "2. The Living Asset",
            content: "Each card represents a physical olive grove. You can see real-time CO2 offset and harvest metrics here.",
            action: "view"
        },
        {
            target: '.modal-btn-primary',
            title: "3. Fractional Ownership",
            content: "Buy SFT fractions. 10,000 shares = 1 Tree. You are buying the rights to future harvests and carbon credits.",
            action: "click"
        },
        {
            target: 'a[href="gov.html"]',
            title: "4. Governance & Staking",
            content: "Once you own shares, move to the Gov portal to stake them. Staking unlocks your share of the SOL revenue pool.",
            action: "click"
        }
    ];

    constructor() {
        // Keyboard Navigation - Only active if modal is visible
        window.addEventListener('keydown', (e) => {
            if (this.modal?.style.display === 'block') {
                if (e.key === 'ArrowRight') this.next();
                if (e.key === 'ArrowLeft') this.prev();
                if (e.key === 'Escape') this.end();
            }
        });
    }

    private setupElements() {
        this.overlay = document.getElementById('tour-overlay');
        this.modal = document.getElementById('tour-modal');

        if (this.overlay) {
            // CRITICAL: Allows clicking the highlighted element below the overlay
            this.overlay.style.pointerEvents = 'none';
        }
        if (this.modal) {
            // Re-enable clicks for the modal itself
            this.modal.style.pointerEvents = 'auto';
        }
    }

    private renderProgressDots() {
        return `
            <div style="display:flex; gap:6px; justify-content:center; margin-top:12px;">
                ${this.steps.map((_, i) => `
                    <div style="width:6px; height:6px; border-radius:50%; background:${i === this.currentStep ? '#22c55e' : '#334155'}; transition:0.3s;"></div>
                `).join('')}
            </div>
        `;
    }

    private createClickIndicator(x: number, y: number) {
        const clicker = document.createElement('div');
        clicker.className = 'tour-click-indicator';
        clicker.style.left = `${x}px`;
        clicker.style.top = `${y}px`;
        document.body.appendChild(clicker);
        setTimeout(() => clicker.remove(), 800);
    }

    public start() {
        this.setupElements();
        if (!this.overlay || !this.modal) return;

        this.currentStep = 0;
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';
        this.showStep();
    }

    public prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep();
        }
    }

    public next() {
        this.currentStep++;

        // Page transition logic (Market -> Gov)
        if (this.currentStep === 3 && window.location.pathname.includes('market')) {
            this.end();
            window.location.href = 'gov.html?tour=true';
            return;
        }

        if (this.currentStep < this.steps.length) {
            this.showStep();
        } else {
            this.end();
        }
    }

    private showStep() {
        const step = this.steps[this.currentStep];
        const el = document.querySelector(step.target) as HTMLElement;

        if (el && this.modal) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                const rect = el.getBoundingClientRect();
                const padding = 15;
                const viewportHeight = window.innerHeight;
                const modalHeight = 220;

                if (step.action === "click") {
                    this.createClickIndicator(rect.left + rect.width / 2, rect.top + rect.height / 2);
                }

                // Update Spotlight CSS Variables
                document.documentElement.style.setProperty('--x', `${rect.left - padding}px`);
                document.documentElement.style.setProperty('--y', `${rect.top - padding}px`);
                document.documentElement.style.setProperty('--x2', `${rect.right + padding}px`);
                document.documentElement.style.setProperty('--y2', `${rect.bottom + padding}px`);

                // Smart Positioning
                let topPosition = rect.bottom + 20;
                if (rect.bottom + modalHeight > viewportHeight) {
                    topPosition = rect.top - modalHeight - 20;
                }

                this.modal!.style.top = `${topPosition}px`;
                this.modal!.style.left = `${Math.max(20, Math.min(window.innerWidth - 340, rect.left))}px`;

                // Render Content
                this.modal!.innerHTML = `
                    <div class="tour-progress-bg" style="height:4px; width:100%; background:rgba(255,255,255,0.1); position:absolute; top:0; left:0; border-radius:16px 16px 0 0;">
                        <div style="height:100%; width:${((this.currentStep + 1) / this.steps.length) * 100}%; background:#22c55e; transition: width 0.3s;"></div>
                    </div>
                    <div class="tour-step-count" style="font-size:9px; color:#22c55e; letter-spacing:2px; margin: 10px 0 5px;">STEP ${this.currentStep + 1} OF ${this.steps.length}</div>
                    <h3 style="color:white; font-family: 'Syne', sans-serif; font-weight:800; margin-bottom:10px;">${step.title}</h3>
                    <p style="color:#94a3b8; font-family: 'Space Mono', monospace; font-size:12px; line-height:1.5; margin-bottom:10px;">${step.content}</p>

                    ${this.renderProgressDots()}

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
                        <button onclick="window.exitTour()" style="background:none; border:none; color:#64748b; font-size:10px; cursor:pointer; font-weight:700;">SKIP</button>
                        <div>
                            ${this.currentStep > 0 ? `<button onclick="window.prevTourStep()" style="background:none; border:1px solid #334155; color:white; padding:8px 14px; border-radius:8px; font-size:11px; cursor:pointer; margin-right:8px;">BACK</button>` : ''}
                            <button onclick="window.nextTourStep()" style="background:#22c55e; color:#060a07; padding:8px 18px; border:none; border-radius:8px; font-weight:800; font-size:11px; cursor:pointer;">
                                ${this.currentStep === this.steps.length - 1 ? 'FINISH' : 'NEXT'}
                            </button>
                        </div>
                    </div>
                `;
            }, 300);
        }
    }

    public end() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.modal) this.modal.style.display = 'none';
    }
}

// Initialize instance
const tourInstance = new OliviumTour();
(window as any).startProtocolTour = () => tourInstance.start();
(window as any).nextTourStep = () => tourInstance.next();
(window as any).prevTourStep = () => tourInstance.prev();
(window as any).exitTour = () => tourInstance.end();
