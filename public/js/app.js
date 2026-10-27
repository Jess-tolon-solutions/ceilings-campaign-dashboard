// Ceilings R Us Campaign Dashboard - Frontend App

const ADMIN_EMAILS = ['jess@tolonsolutions.com', 'jessicatolon@gmail.com'];

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

    // Import modal state
    showImportModal: false,
    selectedFile: null,
    importing: false,
    importResult: null,

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

    // Computed: check if user is admin
    get isAdmin() {
      return ADMIN_EMAILS.some(email =>
        this.userEmail.toLowerCase() === email.toLowerCase()
      );
    },

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

    // Bulk set decision for all filtered clients
    async bulkSetDecision(decision) {
      const clientIds = this.filteredClients.map(c => c.id);
      const count = clientIds.length;

      if (!confirm(`Set ${count} clients to "${decision}"?`)) {
        return;
      }

      // Update all filtered clients
      for (const clientId of clientIds) {
        await this.setDecision(clientId, decision);
      }
    },

    // Handle file selection for import
    handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        this.selectedFile = file;
        this.importResult = null;
      }
    },

    // Preview import (validate without inserting)
    async previewImport() {
      if (!this.selectedFile) return;

      this.importing = true;
      try {
        const text = await this.selectedFile.text();
        const res = await fetch('/api/import-clients?preview=true', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: text
        });
        this.importResult = await res.json();
      } catch (e) {
        this.importResult = { success: false, error: e.message };
      }
      this.importing = false;
    },

    // Run actual import
    async runImport() {
      if (!this.selectedFile) return;

      this.importing = true;
      try {
        const text = await this.selectedFile.text();
        const res = await fetch('/api/import-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: text
        });
        this.importResult = await res.json();

        if (this.importResult.success) {
          // Reload clients after successful import
          await this.loadClients();
        }
      } catch (e) {
        this.importResult = { success: false, error: e.message };
      }
      this.importing = false;
    },

    // Close import modal and reset state
    closeImportModal() {
      this.showImportModal = false;
      this.selectedFile = null;
      this.importResult = null;
      // Reset file input
      const fileInput = document.getElementById('csvFile');
      if (fileInput) fileInput.value = '';
    },

    // Lock round (admin only)
    async lockRound() {
      if (!this.isAdmin) {
        alert('Only Jess can lock rounds.');
        return;
      }

      const yesCount = this.selectionCounts.yes;
      if (!confirm(`Lock round with ${yesCount} selected clients? This will export a CSV and pause the campaign.`)) {
        return;
      }

      try {
        const res = await fetch('/api/lock-round', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        const result = await res.json();

        if (result.success) {
          // Download the CSV
          const blob = new Blob([result.csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${result.campaign_name || 'campaign'}_round_${result.round || 1}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);

          alert(`Round locked! ${result.selected_count} clients exported.`);

          // Reload campaigns to reflect status change
          await this.loadCampaigns();
        } else {
          alert('Failed to lock round: ' + (result.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Failed to lock round: ' + e.message);
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
