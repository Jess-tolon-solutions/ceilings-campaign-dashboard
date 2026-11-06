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
      closeToPageOne: 0,
      movedUp: 0,
      gaps: 0
    },
    seoOpportunities: [],
    seoMovedUpList: [],

    // Metrics data
    metrics: {},
    previousMetrics: {},
    summaries: {},
    metricsMonth: null,
    previousMonth: null,
    seoMonth: null,

    // Working on items
    workingOnItems: [],
    newWorkingOnTitle: '',
    editingWorkingOnId: null,

    // LinkedIn form (admin only - manual entry)
    linkedinForm: {
      impressions: '',
      engagement: '',
      new_followers: '',
      posts_published: '',
      summary1: '',
      summary2: '',
      summary3: ''
    },
    savingLinkedIn: false,

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

    // Reengagement data
    reengagement: {
      counts: { to_review: 0, approved: 0, not_now: 0, already_contacted: 0, cant_email: 0 },
      segmentCounts: { recent: 0, lapsed: 0, dormant: 0 },
      contacts: [],
      campaignResults: []
    },
    reengagementTab: 'to_review',
    reengagementSearch: '',

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

    // Computed: total reengagement contacts
    get reengagementTotal() {
      const c = this.reengagement.counts;
      return c.to_review + c.approved + c.not_now + c.already_contacted + c.cant_email;
    },

    // Computed: filtered reengagement contacts
    get filteredReengagementContacts() {
      if (!this.reengagementSearch) return this.reengagement.contacts;
      const search = this.reengagementSearch.toLowerCase();
      return this.reengagement.contacts.filter(c =>
        c.email?.toLowerCase().includes(search) ||
        c.client_names?.some(n => n.toLowerCase().includes(search))
      );
    },

    // Computed: reengagement tab labels
    get reengagementTabs() {
      return [
        { key: 'to_review', label: 'To review', count: this.reengagement.counts.to_review },
        { key: 'approved', label: 'Approved', count: this.reengagement.counts.approved },
        { key: 'not_now', label: 'Not now', count: this.reengagement.counts.not_now },
        { key: 'already_contacted', label: 'Already contacted', count: this.reengagement.counts.already_contacted },
        { key: 'cant_email', label: "Can't email", count: this.reengagement.counts.cant_email }
      ];
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
      const source = { seo: 'gsc', web: 'ga4' }[this.reportTab];
      if (!source) return []; // Social tab handles summaries differently
      return this.summaries[source] || [];
    },

    // Computed: social platform data (facebook, instagram, linkedin)
    get socialPlatforms() {
      const platforms = [
        { key: 'facebook', name: 'Facebook', firstMetricLabel: 'Reach' },
        { key: 'instagram', name: 'Instagram', firstMetricLabel: 'Reach' },
        { key: 'linkedin', name: 'LinkedIn', firstMetricLabel: 'Impressions' }
      ];

      return platforms.map(platform => {
        const current = this.metrics[platform.key] || {};
        const previous = this.previousMetrics[platform.key] || {};
        const hasData = Object.keys(current).length > 0;

        const getMetricWithChange = (key, label) => {
          const val = current[key];
          const prev = previous[key];
          let change = null;

          if (val !== undefined && prev !== undefined && prev !== 0) {
            const diff = val - prev;
            change = {
              direction: diff > 0 ? '↑' : diff < 0 ? '↓' : '',
              previous: prev,
              diff: Math.abs(diff),
              improved: diff > 0
            };
          }

          return {
            key,
            label,
            value: val,
            formattedValue: val !== undefined ? this.formatNumber(val) : null,
            change
          };
        };

        // Use 'reach' for facebook/instagram, 'impressions' for linkedin
        const firstKey = platform.key === 'linkedin' ? 'impressions' : 'reach';

        return {
          ...platform,
          hasData,
          summary: this.summaries[platform.key] || [],
          metrics: {
            reach: getMetricWithChange(firstKey, platform.firstMetricLabel),
            engagement: getMetricWithChange('engagement', 'Engagement'),
            new_followers: getMetricWithChange('new_followers', 'New Followers'),
            posts_published: getMetricWithChange('posts_published', 'Posts Published')
          }
        };
      });
    },

    // Computed: combined social metrics across all platforms
    get combinedSocialMetrics() {
      const platforms = this.socialPlatforms;
      const sum = (key) => {
        let total = 0;
        let hasAny = false;
        for (const p of platforms) {
          const val = p.metrics[key]?.value;
          if (val !== undefined) {
            total += val;
            hasAny = true;
          }
        }
        return hasAny ? total : null;
      };

      const prevSum = (key) => {
        let total = 0;
        let hasAny = false;
        for (const p of platforms) {
          const val = p.metrics[key]?.change?.previous;
          if (val !== undefined) {
            total += val;
            hasAny = true;
          }
        }
        return hasAny ? total : null;
      };

      const getWithChange = (key, label) => {
        const val = sum(key);
        const prev = prevSum(key);
        let change = null;

        if (val !== null && prev !== null && prev !== 0) {
          const diff = val - prev;
          change = {
            direction: diff > 0 ? '↑' : diff < 0 ? '↓' : '',
            previous: prev,
            diff: Math.abs(diff),
            improved: diff > 0
          };
        }

        return {
          key,
          label,
          value: val,
          formattedValue: val !== null ? this.formatNumber(val) : null,
          change
        };
      };

      return {
        reach: getWithChange('reach', 'Total Reach/Impressions'),
        engagement: getWithChange('engagement', 'Total Engagement'),
        new_followers: getWithChange('new_followers', 'Total New Followers'),
        posts_published: getWithChange('posts_published', 'Total Posts Published')
      };
    },

    // Computed: check if any social platform has data
    get hasSocialData() {
      return this.socialPlatforms.some(p => p.hasData);
    },

    // Computed: current metrics based on tab with month-over-month
    get currentMetrics() {
      const source = { seo: 'gsc', web: 'ga4' }[this.reportTab];
      if (!source) return []; // Social tab uses socialPlatforms instead

      const metricDefs = {
        gsc: ['clicks', 'impressions', 'ctr', 'average_position', 'pages_ranking'],
        ga4: ['service_area_visitors', 'florida_visitors', 'all_visits', 'engaged_sessions', 'contact_forms_started', 'contact_page_visits', 'call_taps']
      };
      const labels = {
        clicks: 'Clicks from Google',
        impressions: 'Impressions',
        ctr: 'Click-through Rate',
        average_position: 'Avg. Position',
        pages_ranking: 'Pages Ranking',
        service_area_visitors: 'Service-area Visitors',
        florida_visitors: 'Florida Visitors (bots removed)',
        all_visits: 'All Website Visits',
        engaged_sessions: 'Engaged Sessions (Florida)',
        contact_forms_started: 'Contact Forms Started',
        contact_page_visits: 'Contact Page Visits',
        call_taps: 'Phone Taps'
      };

      const sourceMetrics = this.metrics[source] || {};
      const prevSourceMetrics = this.previousMetrics[source] || {};

      return (metricDefs[source] || []).map(key => {
        const current = sourceMetrics[key];
        const previous = prevSourceMetrics[key];
        let change = null;

        if (current !== undefined && previous !== undefined && previous !== 0) {
          const diff = current - previous;
          const direction = diff > 0 ? '↑' : diff < 0 ? '↓' : '';
          change = {
            direction,
            previous,
            diff: Math.abs(diff),
            improved: key === 'average_position' ? diff < 0 : diff > 0 // Lower position is better for avg_position
          };
        }

        return {
          key,
          label: labels[key] || key,
          value: current !== undefined ? this.formatMetricValue(key, current) : null,
          rawValue: current,
          change,
          isHeadline: key === 'service_area_visitors'
        };
      });
    },

    // Computed: headline metric for Website Traffic
    get headlineMetric() {
      return this.currentMetrics.find(m => m.isHeadline) || this.currentMetrics[0];
    },

    // Computed: chart title based on tab
    get chartTitle() {
      const titles = {
        seo: 'Clicks from Google',
        web: 'Service-area visitors',
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
        this.loadRound2Counts(),
        this.loadWorkingOn(),
        this.loadReengagement()
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
          this.seoOpportunities = data.opportunities || [];
          this.seoMovedUpList = data.movedUpList || [];
          this.seoMonth = data.month || null;
        }
      } catch (e) {
        console.log('SEO data not available yet');
      }
    },

    // Load metrics
    async loadMetrics() {
      try {
        const res = await fetch('/api/metrics');
        if (res.ok) {
          const data = await res.json();
          this.metrics = data.metrics || {};
          this.previousMetrics = data.previousMetrics || {};
          this.summaries = data.summaries || {};
          this.metricsMonth = data.month || null;
          this.previousMonth = data.previousMonth || null;

          // Pre-fill linkedin form if data exists
          if (this.metrics.linkedin) {
            this.linkedinForm.impressions = this.metrics.linkedin.impressions || '';
            this.linkedinForm.engagement = this.metrics.linkedin.engagement || '';
            this.linkedinForm.new_followers = this.metrics.linkedin.new_followers || '';
            this.linkedinForm.posts_published = this.metrics.linkedin.posts_published || '';
          }
          if (this.summaries.linkedin && this.summaries.linkedin.length >= 3) {
            this.linkedinForm.summary1 = this.summaries.linkedin[0] || '';
            this.linkedinForm.summary2 = this.summaries.linkedin[1] || '';
            this.linkedinForm.summary3 = this.summaries.linkedin[2] || '';
          }
        }
      } catch (e) {
        // Metrics endpoint may not be available
      }
    },

    // Load working on items
    async loadWorkingOn() {
      try {
        const res = await fetch('/api/working-on');
        if (res.ok) {
          const data = await res.json();
          this.workingOnItems = data.items || [];
        }
      } catch (e) {
        // Working on endpoint may not exist yet
      }
    },

    // Add working on item (admin only)
    async addWorkingOnItem() {
      if (!this.isAdmin || !this.newWorkingOnTitle.trim()) return;

      try {
        const res = await fetch('/api/working-on', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: this.newWorkingOnTitle.trim() })
        });

        if (res.ok) {
          this.newWorkingOnTitle = '';
          await this.loadWorkingOn();
        }
      } catch (e) {
        console.error('Failed to add item:', e);
      }
    },

    // Update working on item status (admin only)
    async updateWorkingOnStatus(id, status) {
      if (!this.isAdmin) return;

      try {
        const res = await fetch(`/api/working-on/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });

        if (res.ok) {
          await this.loadWorkingOn();
        }
      } catch (e) {
        console.error('Failed to update item:', e);
      }
    },

    // Delete working on item (admin only)
    async deleteWorkingOnItem(id) {
      if (!this.isAdmin) return;

      try {
        const res = await fetch(`/api/working-on/${id}`, { method: 'DELETE' });
        if (res.ok) {
          await this.loadWorkingOn();
        }
      } catch (e) {
        console.error('Failed to delete item:', e);
      }
    },

    // Save LinkedIn metrics (admin only - manual entry)
    async saveLinkedInMetrics() {
      if (!this.isAdmin || !this.metricsMonth) return;

      this.savingLinkedIn = true;
      try {
        const metrics = {
          impressions: parseInt(this.linkedinForm.impressions) || 0,
          engagement: parseInt(this.linkedinForm.engagement) || 0,
          new_followers: parseInt(this.linkedinForm.new_followers) || 0,
          posts_published: parseInt(this.linkedinForm.posts_published) || 0
        };

        const summary = [
          this.linkedinForm.summary1,
          this.linkedinForm.summary2,
          this.linkedinForm.summary3
        ].filter(s => s.trim());

        const res = await fetch('/api/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: this.metricsMonth,
            metrics,
            summary
          })
        });

        if (res.ok) {
          await this.loadMetrics();
          alert('LinkedIn metrics saved!');
        } else {
          alert('Failed to save metrics');
        }
      } catch (e) {
        alert('Error saving metrics: ' + e.message);
      } finally {
        this.savingLinkedIn = false;
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

    // Load reengagement data
    async loadReengagement(status = null) {
      try {
        const tab = status || this.reengagementTab;
        const res = await fetch(`/api/reengagement?status=${tab}`);
        if (res.ok) {
          const data = await res.json();
          this.reengagement.counts = data.counts || this.reengagement.counts;
          this.reengagement.segmentCounts = data.segmentCounts || this.reengagement.segmentCounts;
          this.reengagement.contacts = data.contacts || [];
          this.reengagement.campaignResults = data.campaignResults || [];
        }
      } catch (e) {
        console.log('Reengagement data not available yet');
      }
    },

    // Change reengagement tab
    async changeReengagementTab(tab) {
      this.reengagementTab = tab;
      this.reengagementSearch = '';
      await this.loadReengagement(tab);
    },

    // Update reengagement contact status
    async updateReengagementStatus(contactId, newStatus) {
      const contact = this.reengagement.contacts.find(c => c.id === contactId);
      if (!contact) return;

      const previousStatus = contact.status;
      contact.status = newStatus;

      try {
        const res = await fetch('/api/reengagement', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: contactId, status: newStatus })
        });

        if (res.ok) {
          // Reload to get updated counts
          await this.loadReengagement();
        } else {
          contact.status = previousStatus;
          console.error('Failed to update status');
        }
      } catch (e) {
        contact.status = previousStatus;
        console.error('Failed to update status:', e);
      }
    },

    // Get segment badge class
    getSegmentBadgeClass(emailVersion) {
      const classes = {
        recent: 'badge-success',
        lapsed: 'badge-warning',
        dormant: 'badge-neutral'
      };
      return classes[emailVersion] || 'badge-neutral';
    },

    // Get segment label
    getSegmentLabel(emailVersion) {
      const labels = {
        recent: 'Recent',
        lapsed: 'Lapsed',
        dormant: 'Dormant'
      };
      return labels[emailVersion] || emailVersion;
    },

    // Format client names for display
    formatClientNames(names) {
      if (!names || !Array.isArray(names)) return '';
      if (names.length === 1) return names[0];
      if (names.length <= 3) return names.join(', ');
      return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
    },

    // Select round and reload clients
    async selectRound(round) {
      this.selectedRound = round;
      if (round === 3) {
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
          Object.assign(lead, data.record);
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
      if (kw.positionChange < 0) return 'badge-success'; // Moved up
      if (kw.positionChange > 0) return 'badge-danger'; // Moved down
      return 'badge-neutral';
    },

    // Get position badge text
    getPositionBadgeText(kw) {
      if (!kw.position) return 'Not ranking';
      if (kw.positionChange < 0) return `↑ was ${kw.previousPosition}`;
      if (kw.positionChange > 0) return `↓ was ${kw.previousPosition}`;
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

    // Get working on status badge
    getWorkingOnBadge(status) {
      const badges = {
        'in_progress': 'badge-info',
        'waiting': 'badge-warning',
        'done': 'badge-success'
      };
      return badges[status] || 'badge-neutral';
    },

    // Get working on status label
    getWorkingOnLabel(status) {
      const labels = {
        'in_progress': 'In progress',
        'waiting': 'Waiting',
        'done': 'Done'
      };
      return labels[status] || status;
    },

    // Format a number with locale formatting
    formatNumber(value) {
      if (value === null || value === undefined) return '—';
      if (typeof value === 'number') {
        return value.toLocaleString();
      }
      return value;
    },

    // Format metric value
    formatMetricValue(key, value) {
      if (value === null || value === undefined) return '—';
      if (key === 'ctr') return (value * 100).toFixed(2) + '%';
      if (key === 'average_position') return value.toFixed(1);
      if (typeof value === 'number') {
        return value.toLocaleString();
      }
      return value;
    },

    // Format change display
    formatChange(change) {
      if (!change) return '';
      return `${change.direction} was ${this.formatMetricValue('', change.previous)}`;
    }
  };
}
