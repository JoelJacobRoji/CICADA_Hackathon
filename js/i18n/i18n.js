/**
 * SENTINEL AI - Lightweight Internationalization (i18n) Engine
 * Full English & Natural Kannada (ಕನ್ನಡ) Localization.
 * Technical identifiers, units (ms, req/s, %), and 'SENTINEL AI' remain in English.
 */

class SentinelI18n {
  constructor() {
    this.currentLang = localStorage.getItem('sentinel_lang') || 'en';
    this.listeners = new Set();

    this.translations = {
      en: {
        // App & Navigation
        appName: 'SENTINEL AI',
        appSubtitle: 'Infrastructure Intelligence',
        navOverview: 'Overview',
        navCommandCenter: 'Command Center',
        navOperations: 'Operations',
        navInfrastructure: 'Infrastructure',
        navIncidents: 'Incidents',
        navInvestigation: 'Investigation',
        navSecurityPrivacy: 'Security & Privacy',
        navDataProtection: 'Data Protection',
        navEgressAudit: 'Egress Audit',
        navCollectors: 'Collectors',
        navIntelligence: 'Intelligence',
        navAnalytics: 'Analytics',
        navMissionReplay: 'Mission Replay',
        navTools: 'Tools',
        navSimulator: 'Simulator',
        navRemediation: 'Remediation',

        // Header & Actions
        envProduction: 'Production',
        envStaging: 'Staging',
        envDevelopment: 'Development',
        systemHealthy: 'System Healthy',
        systemWarning: 'Warning State',
        systemCritical: 'Critical Incident',
        collectorsOnline: 'Collectors Online',
        activeIncidentsCount: 'Active Incidents',
        languageLabel: 'English',
        modeLabel: 'Industry Mode',

        // Common Buttons & Actions
        btnInvestigate: 'Investigate',
        btnResolve: 'Resolve',
        btnInspect: 'Inspect Node',
        btnExecute: 'Execute Runbook',
        btnReset: 'Reset Baseline',
        btnSimulate: 'Simulate Failure',
        btnViewAll: 'View All',
        btnBack: 'Back',
        btnRefresh: 'Refresh',
        btnExport: 'Export Report',
        btnVerify: 'Verify Hashes',
        btnGetStarted: 'Get Started',
        btnSkip: 'Skip for now',

        // Status Badges
        statusHealthy: 'Healthy',
        statusWarning: 'Warning',
        statusCritical: 'Critical',
        statusOffline: 'Offline',
        statusResolved: 'Resolved',

        // Command Center Metrics
        metricHealth: 'System Health',
        metricIncidents: 'Active Incidents',
        metricServices: 'Monitored Services',
        metricCollectors: 'Collectors Online',
        metricIngestion: 'Data Ingestion',
        metricLatency: 'Mean Response',
        topologyTitle: 'Infrastructure Architecture Topology',
        topologySubtitle: 'Interactive multi-tier dependency map with live directional flow',
        healthTrendsTitle: 'Performance Trends',
        recentEventsTitle: 'Recent Operational Events',

        // Tiers
        tierAll: 'All Tiers',
        tierIngress: 'Ingress & Edge',
        tierPrivacy: 'Privacy Enclave',
        tierApps: 'Applications',
        tierData: 'Databases & Storage',
        tierCloud: 'Cloud & Security',

        // Onboarding Screen
        onboardTitle: 'Know your infrastructure. Protect your data.',
        onboardSubtitle: 'Privacy-first autonomous intelligence and automated root-cause isolation tailored for your industry.',
        onboardSelectMode: 'Choose your operational industry mode to customize telemetry & compliance:',
        
        // Industry Modes
        modeGeneral: 'General Tech',
        modeHealthcare: 'Healthcare',
        modeIndustry: 'Industry / SCADA',
        modeFinance: 'Finance / Banking',
        modeEducation: 'Higher Education',

        // Compliance
        complianceLabel: 'Compliance Framework',
        privacyTitle: 'Zero-Knowledge Privacy Center',
        privacyPipeline: 'Egress Protection Pipeline',
        rawLeaked: 'Raw PII Leaked',

        // View Specific Additions
        btnWelcomeTour: '✨ Welcome Screen',
        investigationTitle: 'Investigation Workspace',
        investigationSubtitle: 'Automated causal dependency tracing, cross-metric telemetry correlation, and neural root-cause verification.',
        incidentContext: 'Incident Context',
        causalDagTitle: 'Causal Incident Propagation DAG',
        findingsTitle: 'Root Cause Findings Report',
        confidenceScore: 'Confidence Score',
        probableRootCause: 'Probable Root Cause',
        evidenceChain: 'Corroborating Evidence',
        recommendedAction: 'Recommended Operational Action',
        btnApplyFix: 'Apply Fix Now',
        infraTitle: 'Infrastructure Inventory & Health',
        infraSubtitle: 'Comprehensive telemetry state across all 42 registered enterprise compute nodes, databases, gateways, and enclaves.',
        searchPlaceholder: 'Search service name, role, region...',
        showingServices: 'Showing',
        ofServices: 'of',
        services: 'Services',
        serviceCol: 'Service Identifier',
        roleCol: 'Role & Classification',
        tierCol: 'Tier',
        cpuCol: 'CPU',
        memCol: 'Memory',
        latCol: 'Latency',
        throughputCol: 'Throughput',
        actionsCol: 'Actions',
        simTitle: 'Chaos Engineering & Scenario Simulator',
        simSubtitle: 'Inject deterministic multi-tier infrastructure failures to demonstrate automated AI isolation and zero-knowledge privacy resilience.',
        simState: 'Current Chaos Injection State:',
        simNominal: 'NOMINAL BASELINE (ALL SYSTEMS OPTIMAL)',
        btnInject: 'Inject Failure',
        btnDeactivate: 'Deactivate',
        btnInspectDag: 'Inspect in DAG',
        btnResetBaseline: 'Reset to Nominal Baseline',
        colFleetTitle: 'Collector Fleet Management',
        colFleetSubtitle: 'Status, kernel ring-buffer utilization, and local SQLite WAL health across all distributed eBPF agents.',
        btnPingCollectors: 'Ping All Collectors',
        btnInstallCommand: 'Generate Install Command',
        analyticsTitle: 'Infrastructure Reliability & SRE Analytics',
        analyticsSubtitle: 'Operational health analytics, incident velocity, MTTR benchmarks, and alert fatigue reduction statistics.',
        btnExportSre: 'Export SRE Report',
        replayTitle: 'Mission Replay & Incident Post-Mortem Player',
        replaySubtitle: 'Chronological step-by-step telemetry reconstruction of Incident #1042 Database Saturation.',
        btnExportPostMortem: 'Export Post-Mortem PDF',
        egressAuditTitle: 'Cryptographic Egress Audit & Hash Ledger',
        egressAuditSubtitle: 'Immutable block verification proving 100% adherence to zero-knowledge telemetry allow-lists.',
        btnVerifyChain: 'Verify Hash Chain',
        btnExportCsv: 'Export CSV Ledger'
      },

      kn: {
        // App & Navigation
        appName: 'SENTINEL AI',
        appSubtitle: 'ಮೂಲಸೌಕರ್ಯ ಬುದ್ಧಿಮತ್ತೆ',
        navOverview: 'ಅವಲೋಕನ',
        navCommandCenter: 'ಆದೇಶ ಕೇಂದ್ರ',
        navOperations: 'ಕಾರ್ಯಾಚರಣೆಗಳು',
        navInfrastructure: 'ಮೂಲಸೌಕರ್ಯ',
        navIncidents: 'ಘಟನೆಗಳು',
        navInvestigation: 'ತನಿಖೆ',
        navSecurityPrivacy: 'ಭದ್ರತೆ ಮತ್ತು ಗೌಪ್ಯತೆ',
        navDataProtection: 'ಡೇಟಾ ರಕ್ಷಣೆ',
        navEgressAudit: 'ಹೊರಹರಿವು ಪರಿಶೀಲನೆ',
        navCollectors: 'ಸಂಗ್ರಾಹಕಗಳು',
        navIntelligence: 'ಬುದ್ಧಿಮತ್ತೆ',
        navAnalytics: 'ವಿಶ್ಲೇಷಣೆ',
        navMissionReplay: 'ಮರುಪ್ರಸಾರ',
        navTools: 'ಉಪಕರಣಗಳು',
        navSimulator: 'ಸಿಮ್ಯುಲೇಟರ್',
        navRemediation: 'ಪರಿಹಾರ ಯೋಜನೆ',

        // Header & Actions
        envProduction: 'ಉತ್ಪಾದನೆ (Production)',
        envStaging: 'ಪರೀಕ್ಷೆ (Staging)',
        envDevelopment: 'ಅಭಿವೃದ್ಧಿ (Dev)',
        systemHealthy: 'ವ್ಯವಸ್ಥೆ ಸುಸ್ಥಿತಿಯಲ್ಲಿದೆ',
        systemWarning: 'ಎಚ್ಚರಿಕೆಯ ಸ್ಥಿತಿ',
        systemCritical: 'ನಿರ್ಣಾಯಕ ಘಟನೆ',
        collectorsOnline: 'ಸಕ್ರಿಯ ಸಂಗ್ರಾಹಕಗಳು',
        activeIncidentsCount: 'ಸಕ್ರಿಯ ಘಟನೆಗಳು',
        languageLabel: 'ಕನ್ನಡ',
        modeLabel: 'ಉದ್ಯಮ ಮಾದರಿ',

        // Common Buttons & Actions
        btnInvestigate: 'ತನಿಖೆ ನಡೆಸಿ',
        btnResolve: 'ಪರಿಹರಿಸಿ',
        btnInspect: 'ವಿವರ ನೋಡಿ',
        btnExecute: 'ಯೋಜನೆ ಜಾರಿಗೊಳಿಸಿ',
        btnReset: 'ಮೂಲಸ್ಥಿತಿಗೆ ತನ್ನಿ',
        btnSimulate: 'ವೈಫಲ್ಯ ಪರೀಕ್ಷಿಸಿ',
        btnViewAll: 'ಎಲ್ಲವನ್ನೂ ನೋಡಿ',
        btnBack: 'ಹಿಂದಕ್ಕೆ',
        btnRefresh: 'ನವೀಕರಿಸಿ',
        btnExport: 'ವರದಿ ಡೌನ್‌ಲೋಡ್',
        btnVerify: 'ದೃಢೀಕರಿಸಿ',
        btnGetStarted: 'ಪ್ರಾರಂಭಿಸಿ',
        btnSkip: 'ಬಿಟ್ಟುಬಿಡಿ',

        // Status Badges
        statusHealthy: 'ಆರೋಗ್ಯಕರ',
        statusWarning: 'ಎಚ್ಚರಿಕೆ',
        statusCritical: 'ನಿರ್ಣಾಯಕ',
        statusOffline: 'ಆಫ್‌ಲೈನ್',
        statusResolved: 'ಪರಿಹರಿಸಲಾಗಿದೆ',

        // Command Center Metrics
        metricHealth: 'ವ್ಯವಸ್ಥೆಯ ಆರೋಗ್ಯ',
        metricIncidents: 'ಸಕ್ರಿಯ ಸಮಸ್ಯೆಗಳು',
        metricServices: 'ಮೇಲ್ವಿಚಾರಣಾ ಸೇವೆಗಳು',
        metricCollectors: 'ಸಕ್ರಿಯ ಸಂಗ್ರಾಹಕಗಳು',
        metricIngestion: 'ಡೇಟಾ ಒಳಹರಿವು',
        metricLatency: 'ಸರಾಸರಿ ಪ್ರತಿಕ್ರಿಯೆ',
        topologyTitle: 'ಮೂಲಸೌಕರ್ಯ ರಚನಾ ನಕ್ಷೆ',
        topologySubtitle: 'ನೈಜ ಸಮಯದ ಡೇಟಾ ಹರಿವಿನೊಂದಿಗೆ ಪರಸ್ಪರ ಸಂಪರ್ಕ ನಕ್ಷೆ',
        healthTrendsTitle: 'ಕಾರ್ಯಕ್ಷಮತೆಯ ಪ್ರವೃತ್ತಿ',
        recentEventsTitle: 'ಇತ್ತೀಚಿನ ಕಾರ್ಯಾಚರಣಾ ಘಟನೆಗಳು',

        // Tiers
        tierAll: 'ಎಲ್ಲಾ ಹಂತಗಳು',
        tierIngress: 'ಪ್ರವೇಶ ಮತ್ತು ಗಡಿ',
        tierPrivacy: 'ಗೌಪ್ಯತಾ ವಲಯ',
        tierApps: 'ಅನ್ವಯಿಕ ಸೇವೆಗಳು',
        tierData: 'ಡೇಟಾಬೇಸ್ ಮತ್ತು ಸಂಗ್ರಹ',
        tierCloud: 'ಕ್ಲೌಡ್ ಮತ್ತು ಭದ್ರತೆ',

        // Onboarding Screen
        onboardTitle: 'ನಿಮ್ಮ ಮೂಲಸೌಕರ್ಯವನ್ನು ಅರಿಯಿರಿ. ನಿಮ್ಮ ಡೇಟಾವನ್ನು ರಕ್ಷಿಸಿ.',
        onboardSubtitle: 'ನಿಮ್ಮ ಉದ್ಯಮಕ್ಕೆ ತಕ್ಕಂತೆ ರೂಪಿಸಲಾದ ಗೌಪ್ಯತೆ-ಆಧಾರಿತ ಸ್ವಾಯತ್ತ ಬುದ್ಧಿಮತ್ತೆ ಮತ್ತು ಸ್ವಯಂಚಾಲಿತ ಮೂಲ-ಕಾರಣ ಪತ್ತೆ ವ್ಯವಸ್ಥೆ.',
        onboardSelectMode: 'ಟೆಲಿಮೆಟ್ರಿ ಮತ್ತು ನಿಯಮಾವಳಿಗಳನ್ನು ಹೊಂದಿಸಲು ನಿಮ್ಮ ಕಾರ್ಯಾಚರಣಾ ಉದ್ಯಮವನ್ನು ಆಯ್ಕೆಮಾಡಿ:',

        // Industry Modes
        modeGeneral: 'ಸಾಮಾನ್ಯ ತಂತ್ರಜ್ಞಾನ',
        modeHealthcare: 'ಆರೋಗ್ಯ ಸೇವೆ',
        modeIndustry: 'ಕೈಗಾರಿಕೆ / SCADA',
        modeFinance: 'ಹಣಕಾಸು / ಬ್ಯಾಂಕಿಂಗ್',
        modeEducation: 'ಉನ್ನತ ಶಿಕ್ಷಣ',

        // Compliance
        complianceLabel: 'ಅನುಸರಣಾ ಚೌಕಟ್ಟು',
        privacyTitle: 'ಶೂನ್ಯ-ಜ್ಞಾನ ಗೌಪ್ಯತಾ ಕೇಂದ್ರ',
        privacyPipeline: 'ಡೇಟಾ ಸಂರಕ್ಷಣಾ ಹರಿವು',
        rawLeaked: 'ಸೋರಿಕೆಯಾದ ಸೂಕ್ಷ್ಮ ಡೇಟಾ',

        // View Specific Additions
        btnWelcomeTour: '✨ ಪರಿಚಯ ಪರದೆ',
        investigationTitle: 'ತನಿಖಾ ಕಾರ್ಯಾಚರಣೆ',
        investigationSubtitle: 'ಸ್ವಯಂಚಾಲಿತ ಕಾರಣ-ಪರಿಣಾಮ ಪತ್ತೆ ಮತ್ತು ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆಯ ಮೂಲ-ಕಾರಣ ವಿಶ್ಲೇಷಣೆ.',
        incidentContext: 'ಘಟನೆಯ ಸನ್ನಿವೇಶ',
        causalDagTitle: 'ಕಾರಣ-ಪರಿಣಾಮ ಹರಡುವಿಕೆಯ ನಕ್ಷೆ (DAG)',
        findingsTitle: 'ಮೂಲ-ಕಾರಣ ಪತ್ತೆ ವರದಿ',
        confidenceScore: 'ವಿಶ್ವಾಸಾರ್ಹತೆ ಸ್ಕೋರ್',
        probableRootCause: 'ಸಂಭಾವ್ಯ ಮೂಲ ಕಾರಣ',
        evidenceChain: 'ಪೂರಕ ಪುರಾವೆಗಳು',
        recommendedAction: 'ಶಿಫಾರಸು ಮಾಡಿದ ಕಾರ್ಯಾಚರಣಾ ಕ್ರಮ',
        btnApplyFix: 'ಪರಿಹಾರವನ್ನು ಅನ್ವಯಿಸಿ',
        infraTitle: 'ಮೂಲಸೌಕರ್ಯ ದಾಸ್ತಾನು ಮತ್ತು ಆರೋಗ್ಯ',
        infraSubtitle: 'ಎಲ್ಲಾ 42 ನೋಡ್‌ಗಳು, ಡೇಟಾಬೇಸ್‌ಗಳು ಮತ್ತು ಗೇಟ್‌ವೇಗಳ ಸಮಗ್ರ ಟೆಲಿಮೆಟ್ರಿ ಸ್ಥಿತಿ.',
        searchPlaceholder: 'ಸೇವೆ, ಪಾತ್ರ, ಪ್ರದೇಶ ಹುಡುಕಿ...',
        showingServices: 'ಪ್ರದರ್ಶಿಸಲಾಗುತ್ತಿದೆ',
        ofServices: 'ರ',
        services: 'ಸೇವೆಗಳು',
        serviceCol: 'ಸೇವಾ ವಿವರ',
        roleCol: 'ಪಾತ್ರ ಮತ್ತು ವರ್ಗೀಕರಣ',
        tierCol: 'ಹಂತ',
        cpuCol: 'ಸಿಪಿಯು',
        memCol: 'ಮೆಮೊರಿ',
        latCol: 'ವಿಳಂಬ',
        throughputCol: 'ವೇಗ',
        actionsCol: 'ಕ್ರಮಗಳು',
        simTitle: 'ಕ್ಯಾವೋಸ್ ಇಂಜಿನಿಯರಿಂಗ್ ಮತ್ತು ಸಿಮ್ಯುಲೇಟರ್',
        simSubtitle: 'ವೈಫಲ್ಯಗಳನ್ನು ಉಂಟುಮಾಡಿ ಸ್ವಯಂಚಾಲಿತ ಪ್ರತ್ಯೇಕತೆ ಮತ್ತು ಗೌಪ್ಯತಾ ರಕ್ಷಣೆಯನ್ನು ಪರೀಕ್ಷಿಸಿ.',
        simState: 'ಪ್ರಸ್ತುತ ಸಿಮ್ಯುಲೇಶನ್ ಸ್ಥಿತಿ:',
        simNominal: 'ಸಾಮಾನ್ಯ ಸ್ಥಿತಿ (ಎಲ್ಲಾ ವ್ಯವಸ್ಥೆಗಳು ಸುಸ್ಥಿತಿಯಲ್ಲಿವೆ)',
        btnInject: 'ವೈಫಲ್ಯ ಉಂಟುಮಾಡಿ',
        btnDeactivate: 'ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಿ',
        btnInspectDag: 'DAG ನಕ್ಷೆಯಲ್ಲಿ ನೋಡಿ',
        btnResetBaseline: 'ಮೂಲಸ್ಥಿತಿಗೆ ತನ್ನಿ',
        colFleetTitle: 'ಸಂಗ್ರಾಹಕ ದಳದ ನಿರ್ವಹಣೆ',
        colFleetSubtitle: 'ಎಲ್ಲಾ eBPF ಏಜೆಂಟ್‌ಗಳ ರಿಂಗ್-ಬಫರ್ ಮತ್ತು ಸ್ಥಳೀಯ SQLite WAL ಸ್ಥಿತಿ.',
        btnPingCollectors: 'ಎಲ್ಲಾ ಸಂಗ್ರಾಹಕಗಳನ್ನು ಪಿಂಗ್ ಮಾಡಿ',
        btnInstallCommand: 'ಇನ್‌ಸ್ಟಾಲ್ ಕಮಾಂಡ್ ಪಡೆಯಿರಿ',
        analyticsTitle: 'ಮೂಲಸೌಕರ್ಯ ವಿಶ್ವಾಸಾರ್ಹತೆ ಮತ್ತು SRE ವಿಶ್ಲೇಷಣೆ',
        analyticsSubtitle: 'ಆರೋಗ್ಯ ವಿಶ್ಲೇಷಣೆ, MTTR ಮಾನದಂಡಗಳು ಮತ್ತು ಎಚ್ಚರಿಕೆ ಕಡಿತ ಅಂಕಿಅಂಶಗಳು.',
        btnExportSre: 'SRE ವರದಿ ಡೌನ್‌ಲೋಡ್',
        replayTitle: 'ಘಟನೆ ಮರುಪ್ರಸಾರ ಮತ್ತು ಮರಣೋತ್ತರ ಪರೀಕ್ಷೆ',
        replaySubtitle: 'ಘಟನೆ #1042 ರ ಹಂತ-ಹಂತದ ಟೆಲಿಮೆಟ್ರಿ ಮರುಸೃಷ್ಟಿ.',
        btnExportPostMortem: 'ವರದಿ PDF ಡೌನ್‌ಲೋಡ್',
        egressAuditTitle: 'ಕ್ರಿಪ್ಟೋಗ್ರಾಫಿಕ್ ಹೊರಹರಿವು ಪರಿಶೀಲನಾ ಲೆಡ್ಜರ್',
        egressAuditSubtitle: 'ಶೂನ್ಯ-ಜ್ಞಾನ ಟೆಲಿಮೆಟ್ರಿ ನಿಯಮಗಳ 100% ಪಾಲನೆಯನ್ನು ದೃಢೀಕರಿಸುವ ಬ್ಲಾಕ್ ಪರಿಶೀಲನೆ.',
        btnVerifyChain: 'ಹ್ಯಾಶ್ ಸರಪಳಿ ದೃಢೀಕರಿಸಿ',
        btnExportCsv: 'CSV ಲೆಡ್ಜರ್ ಡೌನ್‌ಲೋಡ್'
      }
    };
  }

  t(key) {
    const dict = this.translations[this.currentLang] || this.translations.en;
    return dict[key] || this.translations.en[key] || key;
  }

  setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('sentinel_lang', lang);
      document.documentElement.lang = lang;
      this.notifyListeners();
    }
  }

  getLanguage() {
    return this.currentLang;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.currentLang));
  }
}

// Global Singleton Instance
window.sentinelI18n = new SentinelI18n();

