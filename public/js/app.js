// Ceilings R Us Campaign Dashboard - Frontend App (Redesign)

const ADMIN_EMAILS = ['jess@tolonsolutions.com', 'jessicatolon@gmail.com'];
const CLIENT_COLORS = ['#116782', '#1f5f8a', '#7a4fb0', '#b0592a', '#2e7d4f', '#8a5a00', '#3c4b51'];

function app() {
  return {
    // View state
    currentView: 'overview',
    reportTab: 'seo',

    // User info
    userEmail: '',

    // Data
    campaigns: [],
    clients: [],
    mailTest: {
      armA: { mailed: 0, responses: 0, responseRate: 0, booked: 0 },
      armB: { mailed: 0, responses: 0, responseRate: 0, booked: 0 },
      canDeclareWinner: false,
      winner: ''
    },

    // SEO data
    seoKeywords: [],
    seoPages: [],
    seoStats: {
      targetKeywords: 0,
      onPageOne: 0,
      climbing: 0,
      gaps: 0
    },

    // Metrics data
    metrics: {},
    summaries: {},
    metricsMonth: null,
    seoMonth: null,

    // Call sheet data
    callSheet: {
      weekStart: '',
      weeklyLimit: 3,
      assignedThisWeek: [],
      allLeads: [],
      pipeline: { open: 0, visited: 0, called: 0, won: 0, not_interested: 0, closed: 0, do_not_contact: 0 },
      postcardCount: 0,
      emailCount: 0
    },
    callSheetCityFilter: '',
    callSheetStatusFilter: '',

    // Filters
    clientSearch: '',
    segmentFilter: '',
    decisionFilter: '',

    // Modal state
    showImportModal: false,
    selectedFile: null,
    showResultsImportModal: false,
    resultsImportRound: 1,
    resultsImportFile: null,
    resultsImportBookedJobs: 0,
    resultsImportPreview: null,

    // Round selection
    selectedRound: 3,
    emailResults: {},
    round2Counts: { approved: 0, held: 0 },

    // Stats (computed from data)
    stats: {
      calls: null,
      reached: null,
      booked: null
    },

    // Computed: is admin
    get isAdmin() {
      return ADMIN_EMAILS.some(email =>
        this.userEmail.toLowerCase() === email.toLowerCase()
      );
    },

    // Computed: breadcrumb
    get breadcrumb() {
      const crumbs = {
        overview: 'Overview',
        seo: 'SEO',
        inspection: 'Inspection Data',
        campaigns: 'Campaigns',
        reengagement: 'Campaigns / Client Re-engagement',
        directmail: 'Campaigns / Direct Mail · Nov 2026',
        monthly: 'Monthly Performance'
      };
      return crumbs[this.currentView] || 'Overview';
    },

    // Computed: pending count for sidebar
    get pendingCount() {
      return this.selectionCounts.pending;
    },

    // Computed: mail decisions pending
    get mailDecisionsPending() {
      // This would come from mail_drops with needs_decision status
      return 5; // Placeholder
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

    // Computed: review progress percentage
    get reviewProgress() {
      const total = this.clients.length;
      if (total === 0) return 0;
      const reviewed = this.selectionCounts.yes + this.selectionCounts.no + this.selectionCounts.later;
      return Math.round((reviewed / total) * 100);
    },

    // Computed: filtered clients
    get filteredClients() {
      return this.clients.filter(client => {
        const matchesSearch = !this.clientSearch ||
          client.company?.toLowerCase().includes(this.clientSearch.toLowerCase()) ||
          client.contact_name?.toLowerCase().includes(this.clientSearch.toLowerCase());

        const matchesSegment = !this.segmentFilter || client.segment === this.segmentFilter;

        let matchesDecision = true;
        if (this.decisionFilter === 'Not reviewed') {
          matchesDecision = !client.decision;
        } else if (this.decisionFilter) {
          matchesDecision = client.decision === this.decisionFilter.toLowerCase();
        }

        return matchesSearch && matchesSegment && matchesDecision;
      });
    },

    // Computed: current summary based on tab
    get currentSummary() {
      const source = { seo: 'gsc', web: 'ga4', social: 'meta' }[this.reportTab];
      return this.summaries[source] || [];
    },

    // Computed: current metrics based on tab
    get currentMetrics() {
      const source = { seo: 'gsc', web: 'ga4', social: 'meta' }[this.reportTab];
      const metricDefs = {
        gsc: ['clicks', 'impressions', 'ctr', 'average_position', 'pages_ranking'],
        ga4: ['florida_visitors', 'engaged_sessions', 'contact_page_visits', 'call_taps'],
        meta: ['reach', 'engagement', 'new_followers', 'posts_published']
      };
      const labels = {
        clicks: 'Clicks',
        impressions: 'Impressions',
        ctr: 'CTR',
        average_position: 'Avg. Position',
        pages_ranking: 'Pages Ranking',
        florida_visitors: 'Florida Visitors',
        engaged_sessions: 'Engaged Sessions',
        contact_page_visits: 'Contact Page Visits',
        call_taps: 'Call Taps',
        reach: 'Reach',
        engagement: 'Engagement',
        new_followers: 'New Followers',
        posts_published: 'Posts Published'
      };

      const sourceMetrics = this.metrics[source] || {};
      return (metricDefs[source] || []).map(key => ({
        label: labels[key] || key,
        value: sourceMetrics[key] !== undefined ? this.formatMetricValue(key, sourceMetrics[key]) : null,
        change: null // Would compare to previous month
      }));
    },

    // Computed: chart title based on tab
    get chartTitle() {
      const titles = {
        seo: 'Clicks from Google',
        web: 'Florida visitors',
        social: 'Reach'
      };
      return titles[this.reportTab] || '';
    },

    // Computed: chart note based on tab
    get chartNote() {
      const notes = {
        seo: 'Google Search Console',
        web: 'Google Analytics · bot traffic removed',
        social: 'Facebook + Instagram · organic only'
      };
      return notes[this.reportTab] || '';
    },

    // Computed: top rows based on tab
    get topRows() {
      const source = { seo: 'gsc', web: 'ga4', social: 'meta' }[this.reportTab];
      // This would come from the 'top' array in the ingested data
      return [];
    },

    // Computed: filtered call sheet leads
    get filteredCallSheetLeads() {
      return this.callSheet.allLeads.filter(lead => {
        const matchesCity = !this.callSheetCityFilter ||
          lead.city?.toLowerCase().includes(this.callSheetCityFilter.toLowerCase());

        let matchesStatus = true;
        if (this.callSheetStatusFilter) {
          matchesStatus = lead.status === this.callSheetStatusFilter.toLowerCase().replace(' ', '_');
        }

        return matchesCity && matchesStatus;
      });
    },

    // Initialize app
    async init() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          this.userEmail = data.email || '';
        }
      } catch (e) {
        console.log('Could not fetch user info');
      }

      await Promise.all([
        this.loadCampaigns(),
        this.loadClients(),
        this.loadMailTestData(),
        this.loadSeoData(),
        this.loadMetrics(),
        this.loadCallSheet(),
        this.loadEmailResults(),
        this.loadRound2Counts()
      ]);
    },

    // Load campaigns
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

    // Load clients
    // campaignId: filter by campaign (default: active campaign)
    // excludeApprovedIn: comma-separated campaign IDs to exclude already-approved clients
    async loadClients(campaignId = null, excludeApprovedIn = null) {
      try {
        let url = '/api/clients';
        const params = new URLSearchParams();
        if (campaignId) params.set('campaign_id', campaignId);
        if (excludeApprovedIn) params.set('exclude_approved_in', excludeApprovedIn);
        if (params.toString()) url += '?' + params.toString();

        const res = await fetch(url);
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

    // Load SEO data
    async loadSeoData() {
      try {
        const res = await fetch('/api/seo');
        if (res.ok) {
          const data = await res.json();
          this.seoKeywords = data.keywords || [];
          this.seoPages = data.pages || [];
          this.seoStats = data.stats || this.seoStats;
          this.seoMonth = data.month || null;
        }
      } catch (e) {
        // SEO endpoint may not exist yet
        console.log('SEO data not available yet');
      }
    },

    // Load metrics
    async loadMetrics() {
      try {
        const res = await fetch('/api/metrics');
        console.log('Metrics response status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('Metrics data:', JSON.stringify(data, null, 2));
          this.metrics = data.metrics || {};
          this.summaries = data.summaries || {};
          this.metricsMonth = data.month || null;
        } else {
          console.error('Metrics response not OK:', await res.text());
        }
      } catch (e) {
        console.error('Metrics fetch error:', e);
      }
    },

    // Format month for display (YYYY-MM -> "September 2026")
    formatMonth(month) {
      if (!month) return '';
      const [year, m] = month.split('-');
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
      return `${months[parseInt(m, 10) - 1]} ${year}`;
    },

    // Format week date for display (YYYY-MM-DD -> "Nov 4")
    formatWeekDate(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr + 'T00:00:00');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    },

    // Load call sheet data
    async loadCallSheet() {
      try {
        const res = await fetch('/api/call-sheet');
        if (res.ok) {
          const data = await res.json();
          this.callSheet.weekStart = data.weekStart || '';
          this.callSheet.weeklyLimit = data.weeklyLimit || 3;
          this.callSheet.assignedThisWeek = data.assignedThisWeek || [];
          this.callSheet.allLeads = data.allLeads || [];
          this.callSheet.pipeline = data.pipeline || this.callSheet.pipeline;

          // Count postcards and emails from touch data
          const touch1 = this.callSheet.allLeads.filter(l => l.touches >= 1).length;
          const touch2 = this.callSheet.allLeads.filter(l => l.touches >= 2).length;
          this.callSheet.postcardCount = touch1;
          this.callSheet.emailCount = touch2;
        }
      } catch (e) {
        console.log('Call sheet data not available yet');
      }
    },

    // Load email campaign results
    async loadEmailResults() {
      try {
        const res = await fetch('/api/email-results');
        if (res.ok) {
          const data = await res.json();
          // Index by campaign_id
          this.emailResults = {};
          for (const result of data.results || []) {
            this.emailResults[result.campaign_id] = result;
          }
        }
      } catch (e) {
        console.log('Email results not available yet');
      }
    },

    // Load Round 2 counts
    async loadRound2Counts() {
      try {
        // Campaign ID 2 is Round 2
        const res = await fetch('/api/clients?campaign_id=2');
        if (res.ok) {
          const clients = await res.json();
          const approved = clients.filter(c => c.decision === 'yes').length;
          const held = clients.filter(c => c.hold || c.decision === 'later').length;
          this.round2Counts = { approved, held };
        }
      } catch (e) {
        console.log('Round 2 counts not available yet');
      }
    },

    // Select round and reload clients
    async selectRound(round) {
      this.selectedRound = round;
      if (round === 3) {
        // Round 3 excludes clients approved in Round 2
        await this.loadClients(3, '2');
      } else {
        await this.loadClients(round);
      }
    },

    // Preview results import
    async previewResultsImport() {
      if (!this.resultsImportFile) return;

      const formData = new FormData();
      formData.append('file', this.resultsImportFile);
      formData.append('campaign_id', this.resultsImportRound.toString());
      formData.append('preview', 'true');
      formData.append('booked_jobs', this.resultsImportBookedJobs.toString());

      try {
        const res = await fetch('/api/import-email-results', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.preview) {
          this.resultsImportPreview = data.results;
        } else {
          alert('Preview failed: ' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Preview failed: ' + e.message);
      }
    },

    // Confirm results import
    async confirmResultsImport() {
      if (!this.resultsImportFile || !this.resultsImportPreview) return;

      const formData = new FormData();
      formData.append('file', this.resultsImportFile);
      formData.append('campaign_id', this.resultsImportRound.toString());
      formData.append('preview', 'false');
      formData.append('booked_jobs', this.resultsImportBookedJobs.toString());

      try {
        const res = await fetch('/api/import-email-results', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          await this.loadEmailResults();
          this.showResultsImportModal = false;
          this.resultsImportFile = null;
          this.resultsImportPreview = null;
          this.resultsImportBookedJobs = 0;
        } else {
          alert('Import failed: ' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Import failed: ' + e.message);
      }
    },

    // Set call sheet lead status
    async setCallSheetStatus(leadId, status) {
      const lead = this.callSheet.allLeads.find(l => l.id === leadId);
      if (!lead) return;

      const previousStatus = lead.status;
      lead.status = status;

      try {
        const res = await fetch(`/api/call-sheet/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, outcome_by: 'Jonathan' })
        });

        if (res.ok) {
          const data = await res.json();
          // Update with server response
          Object.assign(lead, data.record);
          // Refresh to update pipeline counts
          await this.loadCallSheet();
        } else {
          lead.status = previousStatus;
          console.error('Failed to update status');
        }
      } catch (e) {
        lead.status = previousStatus;
        console.error('Failed to update status:', e);
      }
    },

    // Toggle call sheet filter
    toggleCallSheetFilter(type) {
      if (type === 'city') {
        const cities = [...new Set(this.callSheet.allLeads.map(l => l.city).filter(Boolean))];
        const idx = cities.indexOf(this.callSheetCityFilter);
        this.callSheetCityFilter = cities[(idx + 1) % (cities.length + 1)] || '';
      } else if (type === 'status') {
        const statuses = ['', 'Open', 'Visited', 'Called', 'Won', 'Not interested', 'Closed', 'Do not contact'];
        const idx = statuses.indexOf(this.callSheetStatusFilter);
        this.callSheetStatusFilter = statuses[(idx + 1) % statuses.length];
      }
    },

    // Get call sheet status badge class
    getCallSheetStatusBadge(status) {
      const badges = {
        open: 'badge-neutral',
        visited: 'badge-info',
        called: 'badge-info',
        won: 'badge-success',
        not_interested: 'badge-warning',
        closed: 'badge-danger',
        closed_gone: 'badge-danger',
        do_not_contact: 'badge-danger'
      };
      return badges[status] || 'badge-neutral';
    },

    // Format call sheet status for display
    formatCallSheetStatus(status) {
      const labels = {
        open: 'Open',
        visited: 'Visited',
        called: 'Called',
        won: 'Won',
        not_interested: 'Not interested',
        closed: 'Closed',
        closed_gone: 'Closed (gone)',
        do_not_contact: 'Do not contact'
      };
      return labels[status] || status || 'Open';
    },

    // Set client decision
    async setDecision(clientId, decision) {
      const client = this.clients.find(c => c.id === clientId);
      if (client && !client.do_not_send) {
        const previousDecision = client.decision;
        client.decision = decision;

        try {
          const res = await fetch('/api/selections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, decision })
          });

          if (!res.ok) {
            client.decision = previousDecision;
            console.error('Failed to save decision');
          }
        } catch (e) {
          client.decision = previousDecision;
          console.error('Failed to save decision:', e);
        }
      }
    },

    // Lock round
    async lockRound() {
      if (!this.isAdmin) {
        alert('Only admins can lock rounds.');
        return;
      }

      const yesCount = this.selectionCounts.yes;
      if (!confirm(`Lock round with ${yesCount} selected clients?`)) {
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
          const blob = new Blob([result.csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${result.campaign_name || 'campaign'}_round_${result.round || 1}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);

          alert(`Round locked! ${result.selected_count} clients exported.`);
          await this.loadCampaigns();
        } else {
          alert('Failed to lock round: ' + (result.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Failed to lock round: ' + e.message);
      }
    },

    // Handle file select
    handleFileSelect(event) {
      this.selectedFile = event.target.files[0];
    },

    // Run import
    async runImport() {
      if (!this.selectedFile) return;

      try {
        const text = await this.selectedFile.text();
        const res = await fetch('/api/import-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: text
        });

        const result = await res.json();
        if (result.success) {
          await this.loadClients();
          this.showImportModal = false;
          this.selectedFile = null;
        } else {
          alert('Import failed: ' + (result.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Import failed: ' + e.message);
      }
    },

    // Toggle segment filter
    toggleSegmentFilter() {
      const segments = [...new Set(this.clients.map(c => c.segment).filter(Boolean))];
      const idx = segments.indexOf(this.segmentFilter);
      this.segmentFilter = segments[(idx + 1) % (segments.length + 1)] || '';
    },

    // Toggle decision filter
    toggleStatusFilter() {
      const options = ['', 'Not reviewed', 'Yes', 'No', 'Later'];
      const idx = options.indexOf(this.decisionFilter);
      this.decisionFilter = options[(idx + 1) % options.length];
    },

    // Get client color
    getClientColor(client) {
      const idx = this.clients.indexOf(client);
      return CLIENT_COLORS[idx % CLIENT_COLORS.length];
    },

    // Get client initials
    getClientInitials(client) {
      if (client.segment) {
        return client.segment.slice(0, 2).toUpperCase();
      }
      return client.company?.slice(0, 2).toUpperCase() || '??';
    },

    // Get position badge class
    getPositionBadgeClass(kw) {
      if (!kw.position) return 'badge-warning';
      // This would compare to previous month
      return 'badge-neutral';
    },

    // Get position badge text
    getPositionBadgeText(kw) {
      if (!kw.position) return 'Not ranking';
      return `${kw.clicks || 0} clicks`;
    },

    // Get index status class
    getIndexStatusClass(status) {
      const classes = {
        'indexed': 'badge-success',
        'not_indexed': 'badge-danger',
        'discovered_not_indexed': 'badge-warning',
        'crawled_not_indexed': 'badge-warning',
        'unknown': 'badge-neutral'
      };
      return classes[status] || 'badge-neutral';
    },

    // Get index status text
    getIndexStatusText(status) {
      const texts = {
        'indexed': 'Indexed',
        'not_indexed': 'Not indexed',
        'discovered_not_indexed': 'Discovered',
        'crawled_not_indexed': 'Crawled',
        'unknown': 'Unknown'
      };
      return texts[status] || status || 'Unknown';
    },

    // Format metric value
    formatMetricValue(key, value) {
      if (value === null || value === undefined) return '—';
      if (key === 'ctr') return (value * 100).toFixed(1) + '%';
      if (key === 'average_position') return value.toFixed(1);
      if (typeof value === 'number') {
        return value.toLocaleString();
      }
      return value;
    }
  };
}
