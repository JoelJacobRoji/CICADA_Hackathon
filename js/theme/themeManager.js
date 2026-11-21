/**
 * SENTINEL AI - Industry Modes & Theming System
 * Manages 5 industry profiles (General, Healthcare, Industry, Finance, Education)
 * with dynamic CSS variable injection, domain terminology, customized node catalogs,
 * compliance frameworks, and smooth 400ms transitions.
 */

class SentinelThemeManager {
  constructor() {
    this.currentMode = localStorage.getItem('sentinel_mode') || 'general';
    this.listeners = new Set();

    this.modes = {
      general: {
        id: 'general',
        nameEn: 'General Tech',
        nameKn: 'ಸಾಮಾನ್ಯ ತಂತ್ರಜ್ಞಾನ',
        icon: '⚡',
        palette: {
          primary: '#7C5CFF',
          primaryLight: '#B48CFF',
          primaryUltraLight: 'rgba(124, 92, 255, 0.08)',
          secondary: '#E879F9',
          heroGradient: 'linear-gradient(135deg, #7C5CFF 0%, #C084FC 50%, #E879F9 100%)',
          bgTint: '#F7F6FC',
          surface: '#FFFFFF',
          surfaceElevated: '#FAF9FF',
          surfaceHover: '#F2EFFE',
          borderSubtle: '#E8E4F7',
          borderHover: '#D3CCF2',
          textPrimary: '#1E1B2E',
          textSecondary: '#6B6684',
          textMuted: '#9B96B3',
          shadowSoft: '0 8px 30px -4px rgba(124, 92, 255, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
          shadowElevated: '0 16px 40px -6px rgba(124, 92, 255, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.04)'
        },
        compliance: 'GDPR / DPDP Standard',
        terminology: {
          servicesLabel: 'Monitored Services',
          ingressLabel: 'Anycast Edge CDN & Ingress',
          coreAppLabel: 'Microservices Mesh',
          dbLabel: 'PostgreSQL HA Cluster',
          incidentTitle: 'Database Connection Pool Saturation'
        },
        nodeNames: {
          'node-cdn-edge': 'cloudflare-edge-01',
          'node-waf-guard': 'waf-shield-proxy',
          'node-api-gw': 'api-gateway-core',
          'node-auth-svc': 'auth-service',
          'node-order-svc': 'order-processor',
          'node-billing-svc': 'billing-engine',
          'node-search-svc': 'search-indexer',
          'node-pg-primary': 'postgres-primary-01',
          'node-pg-replica': 'postgres-read-replica-01',
          'node-redis-cache': 'redis-cluster-cache',
          'node-kafka-bus': 'kafka-event-mesh',
          'node-clickhouse': 'clickhouse-olap'
        }
      },

      healthcare: {
        id: 'healthcare',
        nameEn: 'Healthcare',
        nameKn: 'ಆರೋಗ್ಯ ಸೇವೆ',
        icon: '🏥',
        palette: {
          primary: '#2F6BFF',
          primaryLight: '#85ACFF',
          primaryUltraLight: 'rgba(47, 107, 255, 0.08)',
          secondary: '#E5484D',
          heroGradient: 'linear-gradient(135deg, #2F6BFF 0%, #6095FF 50%, #38BDF8 100%)',
          bgTint: '#F4F7FD',
          surface: '#FFFFFF',
          surfaceElevated: '#F8FAFF',
          surfaceHover: '#EEF3FF',
          borderSubtle: '#E2EAF8',
          borderHover: '#C6D8F8',
          textPrimary: '#111B33',
          textSecondary: '#54658A',
          textMuted: '#8999BE',
          shadowSoft: '0 8px 30px -4px rgba(47, 107, 255, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
          shadowElevated: '0 16px 40px -6px rgba(47, 107, 255, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.04)'
        },
        compliance: 'HIPAA § 164.514 / DPDP Health Enclave',
        terminology: {
          servicesLabel: 'Clinical Systems',
          ingressLabel: 'HL7 / FHIR Clinical Gateway',
          coreAppLabel: 'EHR & Triage Pipelines',
          dbLabel: 'PACS Diagnostic Image Lake',
          incidentTitle: 'PACS Diagnostic Imaging Cluster Saturation'
        },
        nodeNames: {
          'node-cdn-edge': 'fhir-ingress-edge',
          'node-waf-guard': 'hipaa-perimeter-shield',
          'node-api-gw': 'clinical-api-gateway',
          'node-auth-svc': 'ehr-provider-auth',
          'node-order-svc': 'patient-triage-service',
          'node-billing-svc': 'medical-claims-engine',
          'node-search-svc': 'icd10-clinical-indexer',
          'node-pg-primary': 'pacs-imaging-primary-01',
          'node-pg-replica': 'pacs-imaging-replica',
          'node-redis-cache': 'bed-availability-cache',
          'node-kafka-bus': 'vital-telemetry-mesh',
          'node-clickhouse': 'epidemic-analytics-lake'
        }
      },

      industry: {
        id: 'industry',
        nameEn: 'Industry / SCADA',
        nameKn: 'ಕೈಗಾರಿಕೆ / SCADA',
        icon: '⚙️',
        palette: {
          primary: '#3B82C4',
          primaryLight: '#80B6E6',
          primaryUltraLight: 'rgba(59, 130, 196, 0.08)',
          secondary: '#F59E0B',
          heroGradient: 'linear-gradient(135deg, #3B82C4 0%, #0284C7 50%, #F59E0B 100%)',
          bgTint: '#F3F6FA',
          surface: '#FFFFFF',
          surfaceElevated: '#F8FAFD',
          surfaceHover: '#EDF3F9',
          borderSubtle: '#DEE6EF',
          borderHover: '#C2D1E2',
          textPrimary: '#142230',
          textSecondary: '#506377',
          textMuted: '#8193A7',
          shadowSoft: '0 8px 30px -4px rgba(59, 130, 196, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
          shadowElevated: '0 16px 40px -6px rgba(59, 130, 196, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.04)'
        },
        compliance: 'ISO 27001 / IEC 62443 Industrial Enclave',
        terminology: {
          servicesLabel: 'SCADA & PLC Units',
          ingressLabel: 'Modbus / OPC-UA Gateway',
          coreAppLabel: 'Automated Line Controllers',
          dbLabel: 'Historian Timeseries DB',
          incidentTitle: 'Historian Sensor Telemetry Queue Overflow'
        },
        nodeNames: {
          'node-cdn-edge': 'scada-gateway-edge',
          'node-waf-guard': 'ot-firewall-guard',
          'node-api-gw': 'opc-ua-protocol-mesh',
          'node-auth-svc': 'plant-operator-auth',
          'node-order-svc': 'assembly-line-controller',
          'node-billing-svc': 'erp-supply-sync',
          'node-search-svc': 'predictive-maintenance-idx',
          'node-pg-primary': 'historian-timeseries-01',
          'node-pg-replica': 'historian-read-replica',
          'node-redis-cache': 'sensor-state-cache',
          'node-kafka-bus': 'plc-telemetry-bus',
          'node-clickhouse': 'yield-analytics-lake'
        }
      },

      finance: {
        id: 'finance',
        nameEn: 'Finance / Banking',
        nameKn: 'ಹಣಕಾಸು / ಬ್ಯಾಂಕಿಂಗ್',
        icon: '💳',
        palette: {
          primary: '#10B981',
          primaryLight: '#6EE7B7',
          primaryUltraLight: 'rgba(16, 185, 129, 0.08)',
          secondary: '#0F766E',
          heroGradient: 'linear-gradient(135deg, #10B981 0%, #14B8A6 50%, #0EA5E9 100%)',
          bgTint: '#F1FBF6',
          surface: '#FFFFFF',
          surfaceElevated: '#F6FDF9',
          surfaceHover: '#E6F8F0',
          borderSubtle: '#D8F3E5',
          borderHover: '#B2E5CC',
          textPrimary: '#0C261C',
          textSecondary: '#446E5D',
          textMuted: '#7AA393',
          shadowSoft: '0 8px 30px -4px rgba(16, 185, 129, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
          shadowElevated: '0 16px 40px -6px rgba(16, 185, 129, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.04)'
        },
        compliance: 'PCI-DSS v4.0 / RBI Data Residency Enclave',
        terminology: {
          servicesLabel: 'Financial Pipelines',
          ingressLabel: 'ISO 20022 Swift Gateway',
          coreAppLabel: 'Transaction Orchestrators',
          dbLabel: 'Core Banking Ledger (ACID)',
          incidentTitle: 'Core Banking Ledger Transaction Lock'
        },
        nodeNames: {
          'node-cdn-edge': 'swift-iso20022-ingress',
          'node-waf-guard': 'anti-ddos-financial-shield',
          'node-api-gw': 'open-banking-gateway',
          'node-auth-svc': 'vault-token-auth',
          'node-order-svc': 'payment-settlement-engine',
          'node-billing-svc': 'merchant-reconciler',
          'node-search-svc': 'aml-sanctions-search',
          'node-pg-primary': 'core-ledger-postgres-01',
          'node-pg-replica': 'core-ledger-replica',
          'node-redis-cache': 'card-token-cache',
          'node-kafka-bus': 'fraud-signals-mesh',
          'node-clickhouse': 'regulatory-reporting-db'
        }
      },

      education: {
        id: 'education',
        nameEn: 'Higher Education',
        nameKn: 'ಉನ್ನತ ಶಿಕ್ಷಣ',
        icon: '🎓',
        palette: {
          primary: '#4F46E5',
          primaryLight: '#9994F8',
          primaryUltraLight: 'rgba(79, 70, 229, 0.08)',
          secondary: '#F5B63D',
          heroGradient: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #F5B63D 100%)',
          bgTint: '#F9F8FD',
          surface: '#FFFFFF',
          surfaceElevated: '#FCFBFD',
          surfaceHover: '#F2F0FC',
          borderSubtle: '#EAE6F8',
          borderHover: '#D4CCF2',
          textPrimary: '#171433',
          textSecondary: '#5C5680',
          textMuted: '#908AAB',
          shadowSoft: '0 8px 30px -4px rgba(79, 70, 229, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
          shadowElevated: '0 16px 40px -6px rgba(79, 70, 229, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.04)'
        },
        compliance: 'FERPA § 99.31 / DPDP Student Privacy Enclave',
        terminology: {
          servicesLabel: 'Campus Portals',
          ingressLabel: 'Campus WAN & Cloudflare Edge',
          coreAppLabel: 'LMS & Exam Services',
          dbLabel: 'Student Information System DB',
          incidentTitle: 'LMS Online Exam Submission Queue Spike'
        },
        nodeNames: {
          'node-cdn-edge': 'campus-wan-ingress',
          'node-waf-guard': 'edtech-firewall-guard',
          'node-api-gw': 'campus-api-gateway',
          'node-auth-svc': 'shibboleth-sso-auth',
          'node-order-svc': 'canvas-lms-submission',
          'node-billing-svc': 'tuition-fee-portal',
          'node-search-svc': 'library-catalog-indexer',
          'node-pg-primary': 'sis-student-db-01',
          'node-pg-replica': 'sis-student-replica',
          'node-redis-cache': 'exam-session-cache',
          'node-kafka-bus': 'grade-event-mesh',
          'node-clickhouse': 'research-analytics-db'
        }
      }
    };

    // Apply initial theme variables
    this.applyTheme(this.currentMode);
  }

  setMode(modeId) {
    if (this.modes[modeId]) {
      this.currentMode = modeId;
      localStorage.setItem('sentinel_mode', modeId);
      this.applyTheme(modeId);
      this.notifyListeners();
    }
  }

  applyTheme(modeId) {
    const config = this.modes[modeId] || this.modes.general;
    const p = config.palette;
    const root = document.documentElement;

    root.style.setProperty('--primary', p.primary);
    root.style.setProperty('--primary-light', p.primaryLight);
    root.style.setProperty('--primary-ultralight', p.primaryUltraLight);
    root.style.setProperty('--secondary', p.secondary);
    root.style.setProperty('--hero-gradient', p.heroGradient);
    root.style.setProperty('--bg-tint', p.bgTint);
    root.style.setProperty('--surface', p.surface);
    root.style.setProperty('--surface-elevated', p.surfaceElevated);
    root.style.setProperty('--surface-hover', p.surfaceHover);
    root.style.setProperty('--border-subtle', p.borderSubtle);
    root.style.setProperty('--border-hover', p.borderHover);
    root.style.setProperty('--text-primary', p.textPrimary);
    root.style.setProperty('--text-secondary', p.textSecondary);
    root.style.setProperty('--text-muted', p.textMuted);
    root.style.setProperty('--shadow-soft', p.shadowSoft);
    root.style.setProperty('--shadow-elevated', p.shadowElevated);

    // Update body background
    document.body.style.backgroundColor = p.bgTint;
  }

  getModeConfig() {
    return this.modes[this.currentMode] || this.modes.general;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.currentMode, this.getModeConfig()));
  }
}

// Global Singleton Instance
window.sentinelTheme = new SentinelThemeManager();

