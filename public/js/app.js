// Ceilings R Us Campaign Dashboard - Frontend App

function app() {
  return {
    // Current view state
    currentView: 'overview',

    // User info from Cloudflare Access
    userEmail: '',

    // Campaign data
    campaigns: [],

    // Client selection state
    clients: [],
    clientSearch: '',
    countyFilter: '',
    segmentFilter: '',

    // Mail test data
    mailTest: {
      armA: { mailed: 0, responses: 0, responseRate: 0, booked: 0, costPerResponse: 0, missingTracking: 0 },
      armB: { mailed: 0, responses: 0, responseRate: 0, booked: 0, costPerResponse: 0, missingTracking: 0 },
      canDeclareWinner: false,
      winner: ''
    },

    // Performance data
    selectedMonth: '',
    availableMonths: [],

    // Computed: unique counties from clients
    get counties() {
      return [...new Set(this.clients.map(c => c.county).filter(Boolean))].sort();
    },

    // Computed: unique segments from clients
    get segments() {
      return [...new Set(this.clients.map(c => c.segment).filter(Boolean))].sort();
    },

    // Computed: filtered clients based on search and filters
    get filteredClients() {
      return this.clients.filter(client => {
        const matchesSearch = !this.clientSearch ||
          client.company?.toLowerCase().includes(this.clientSearch.toLowerCase()) ||
          client.contact_name?.toLowerCase().includes(this.clientSearch.toLowerCase()) ||
          client.email?.toLowerCase().includes(this.clientSearch.toLowerCase());

        const matchesCounty = !this.countyFilter || client.county === this.countyFilter;
        const matchesSegment = !this.segmentFilter || client.segment === this.segmentFilter;

        return matchesSearch && matchesCounty && matchesSegment;
      });
    },

    // Computed: selection counts
    get selectionCounts() {
      const counts = { yes: 0, no: 0, later: 0, pending: 0 };
      this.clients.forEach(client => {
        if (client.decision === 'yes') counts.yes++;
        else if (client.decision === 'no') counts.no++;
        else if (client.decision === 'later') counts.later++;
        else counts.pending++;
      });
      return counts;
    },

    // Initialize app
    async init() {
      // Get user email from API (which reads from Cloudflare Access headers)
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          this.userEmail = data.email || '';
        }
      } catch (e) {
        console.log('Could not fetch user info');
      }

      // Load initial data
      await this.loadCampaigns();
      await this.loadClients();
      await this.loadMailTestData();
    },

    // Load campaigns from API
    async loadCampaigns() {
      try {
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          this.campaigns = await res.json();
        }
      } catch (e) {
        console.error('Failed to load campaigns:', e);
      }
    },

    // Load clients from API
    async loadClients() {
      try {
        const res = await fetch('/api/clients');
        if (res.ok) {
          this.clients = await res.json();
        }
      } catch (e) {
        console.error('Failed to load clients:', e);
      }
    },

    // Load mail test data
    async loadMailTestData() {
      try {
        const res = await fetch('/api/mail-test');
        if (res.ok) {
          this.mailTest = await res.json();
        }
      } catch (e) {
        console.error('Failed to load mail test data:', e);
      }
    },

    // Set client decision (yes/no/later)
    async setDecision(clientId, decision) {
      // Optimistic update
      const client = this.clients.find(c => c.id === clientId);
      if (client) {
        const previousDecision = client.decision;
        client.decision = decision;

        try {
          const res = await fetch('/api/selections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, decision })
          });

          if (!res.ok) {
            // Revert on error
            client.decision = previousDecision;
            console.error('Failed to save decision');
          }
        } catch (e) {
          client.decision = previousDecision;
          console.error('Failed to save decision:', e);
        }
      }
    },

    // Format date for display
    formatDate(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };
}
