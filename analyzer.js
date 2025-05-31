#!/usr/bin/env node

/**
 * Website JavaScript Compatibility Analyzer
 * Downloads a webpage and analyzes JavaScript for browser compatibility
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');
const { ESLint } = require('eslint');

class JavaScriptCompatibilityAnalyzer {
  constructor() {
    this.tempDir = path.join(__dirname, 'temp_analysis');
    this.eslintConfig = {
      baseConfig: {
        env: {
          browser: true,
          es2021: true
        },
        extends: ['eslint:recommended'],
        plugins: ['compat'],
        rules: {
          'compat/compat': 'error'
        },
        settings: {
          // Default browser targets - can be customized
          browserslist: [
            'last 2 Chrome versions',
            'last 2 Firefox versions',
            'last 2 Safari versions',
            'last 2 Edge versions',
            'IE 11'
          ],
          // Polyfills for features that might be available
          polyfills: [
            // Common polyfills that might be present
            'Promise',
            'fetch',
            'Array.prototype.includes',
            'Array.prototype.find',
            'Object.assign'
          ]
        }
      },
      useEslintrc: false
    };
  }

  /**
   * Download webpage content
   */
  async downloadPage(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
      client.get(url, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          resolve(data);
        });
        
        response.on('error', (error) => {
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Extract JavaScript from HTML and linked files
   */
  async extractJavaScript(html, baseUrl) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const javascriptSources = [];

    // Extract inline JavaScript
    const scriptTags = document.querySelectorAll('script');
    let inlineJsCounter = 0;

    for (const script of scriptTags) {
      if (script.src) {
        // External JavaScript file
        try {
          const scriptUrl = new URL(script.src, baseUrl).href;
          console.log(`Downloading external script: ${scriptUrl}`);
          const scriptContent = await this.downloadPage(scriptUrl);
          javascriptSources.push({
            type: 'external',
            url: scriptUrl,
            content: scriptContent
          });
        } catch (error) {
          console.warn(`Failed to download script ${script.src}:`, error.message);
        }
      } else if (script.textContent && script.textContent.trim()) {
        // Inline JavaScript
        javascriptSources.push({
          type: 'inline',
          url: `inline-${++inlineJsCounter}`,
          content: script.textContent
        });
      }
    }

    return javascriptSources;
  }

  /**
   * Setup temporary directory and files for analysis
   */
  async setupTempFiles(javascriptSources) {
    await fs.mkdir(this.tempDir, { recursive: true });
    const filePaths = [];

    for (let i = 0; i < javascriptSources.length; i++) {
      const source = javascriptSources[i];
      const fileName = `script-${i}-${source.url.replace(/[^a-zA-Z0-9]/g, '_')}.js`;
      const filePath = path.join(this.tempDir, fileName);
      
      await fs.writeFile(filePath, source.content);
      filePaths.push({
        path: filePath,
        source: source
      });
    }

    return filePaths;
  }

  /**
   * Analyze JavaScript files with ESLint
   */
  async analyzeCompatibility(filePaths) {
    const eslint = new ESLint(this.eslintConfig);
    const results = [];
    const compatibilityIssues = [];

    for (const fileInfo of filePaths) {
      try {
        const result = await eslint.lintFiles([fileInfo.path]);
        
        for (const fileResult of result) {
          for (const message of fileResult.messages) {
            if (message.ruleId === 'compat/compat') {
              compatibilityIssues.push({
                file: fileInfo.source.url,
                line: message.line,
                column: message.column,
                message: message.message,
                severity: message.severity === 2 ? 'error' : 'warning'
              });
            }
          }
        }
        
        results.push(...result);
      } catch (error) {
        console.warn(`Failed to analyze ${fileInfo.path}:`, error.message);
      }
    }

    return { results, compatibilityIssues };
  }

  /**
   * Extract browser requirements from compatibility issues
   */
  extractBrowserRequirements(compatibilityIssues) {
    const browserFeatures = new Map();
    const iosSpecificIssues = [];
    
    for (const issue of compatibilityIssues) {
      // Parse the error message to extract browser requirements
      // ESLint compat plugin messages typically include browser version info
      const match = issue.message.match(/not supported in (.+)/);
      if (match) {
        const browsers = match[1];
        browserFeatures.set(issue.message, browsers);
        
        // Check for iOS Safari specific issues
        if (browsers.toLowerCase().includes('safari') || browsers.toLowerCase().includes('ios')) {
          iosSpecificIssues.push({
            feature: issue.message.split(' ')[0],
            issue: issue.message,
            browsers: browsers
          });
        }
      }
    }

    return { browserFeatures, iosSpecificIssues };
  }

  /**
   * Get iOS Safari 15.5 specific compatibility information
   */
  getIOSSafari155Compatibility() {
    // Features that are problematic or have specific behavior in iOS Safari 15.5
    return {
      // Features that were added or changed around iOS 15.5 timeframe
      knownIssues: {
        'CSS.supports': 'Limited support in iOS Safari 15.5',
        'ResizeObserver': 'Supported from iOS Safari 14.5+',
        'IntersectionObserver': 'Full support in iOS Safari 15.5',
        'WebGL2': 'Supported from iOS Safari 15+',
        'SharedArrayBuffer': 'Disabled in iOS Safari for security',
        'BroadcastChannel': 'Not supported in iOS Safari 15.5',
        'Storage API': 'Limited support in iOS Safari',
        'Web Locks API': 'Not supported in iOS Safari 15.5',
        'File System Access API': 'Not supported in iOS Safari',
        'Web Share API': 'Supported with limitations in iOS Safari 15.5',
        'Payment Request API': 'Supported in iOS Safari 15.5',
        'Geolocation API': 'Requires HTTPS in iOS Safari 15.5',
        'getUserMedia': 'Requires user gesture in iOS Safari',
        'Web Audio API': 'Requires user interaction to start',
        'Fullscreen API': 'Limited support in iOS Safari',
        'Clipboard API': 'Requires user gesture in iOS Safari 15.5'
      },
      // JavaScript features that need attention in iOS Safari 15.5
      jsFeatures: {
        'BigInt': 'Supported from iOS Safari 14+',
        'Optional chaining': 'Supported from iOS Safari 14+',
        'Nullish coalescing': 'Supported from iOS Safari 14+',
        'Private class fields': 'Supported from iOS Safari 14.5+',
        'Top-level await': 'Supported from iOS Safari 15+',
        'Array.prototype.at': 'Supported from iOS Safari 15.4+',
        'Object.hasOwn': 'Not supported in iOS Safari 15.5',
        'Array.prototype.findLast': 'Not supported in iOS Safari 15.5',
        'Error.cause': 'Not supported in iOS Safari 15.5'
      }
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanup() {
    try {
      await fs.rmdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error.message);
    }
  }

  /**
   * Generate detailed report
   */
  generateReport(url, javascriptSources, compatibilityIssues, browserRequirements) {
    const iosCompatibility = this.getIOSSafari155Compatibility();
    const { browserFeatures, iosSpecificIssues } = browserRequirements;
    
    const report = {
      url,
      timestamp: new Date().toISOString(),
      summary: {
        totalScripts: javascriptSources.length,
        inlineScripts: javascriptSources.filter(s => s.type === 'inline').length,
        externalScripts: javascriptSources.filter(s => s.type === 'external').length,
        compatibilityIssues: compatibilityIssues.length,
        errors: compatibilityIssues.filter(i => i.severity === 'error').length,
        warnings: compatibilityIssues.filter(i => i.severity === 'warning').length,
        iosSpecificIssues: iosSpecificIssues.length
      },
      javascriptSources: javascriptSources.map(s => ({
        type: s.type,
        url: s.url,
        size: s.content.length
      })),
      compatibilityIssues,
      browserRequirements: Array.from(browserFeatures.entries()).map(([feature, browsers]) => ({
        feature,
        unsupportedIn: browsers
      })),
      iosSpecificAnalysis: {
        targetVersion: 'iOS Safari 15.5',
        specificIssues: iosSpecificIssues,
        knownLimitations: this.analyzeForIOSLimitations(javascriptSources),
        recommendations: this.generateIOSRecommendations(compatibilityIssues, iosSpecificIssues)
      },
      recommendations: this.generateRecommendations(compatibilityIssues, iosSpecificIssues)
    };

    return report;
  }

  /**
   * Analyze JavaScript sources for iOS Safari specific limitations
   */
  analyzeForIOSLimitations(javascriptSources) {
    const limitations = [];
    const iosInfo = this.getIOSSafari155Compatibility();
    
    for (const source of javascriptSources) {
      const content = source.content.toLowerCase();
      
      // Check for known problematic APIs
      Object.keys(iosInfo.knownIssues).forEach(api => {
        const apiLower = api.toLowerCase().replace(/\s+/g, '');
        if (content.includes(apiLower) || content.includes(api.toLowerCase())) {
          limitations.push({
            api,
            issue: iosInfo.knownIssues[api],
            foundIn: source.url
          });
        }
      });

      // Check for features that need user interaction
      const userInteractionAPIs = [
        'webaudio', 'audio.play', 'video.play', 'getusermedia', 
        'navigator.clipboard', 'requestfullscreen'
      ];
      
      userInteractionAPIs.forEach(api => {
        if (content.includes(api)) {
          limitations.push({
            api: api,
            issue: 'Requires user interaction in iOS Safari',
            foundIn: source.url
          });
        }
      });

      // Check for viewport and touch-specific issues
      if (content.includes('viewport') || content.includes('touch')) {
        limitations.push({
          api: 'Touch/Viewport handling',
          issue: 'May need special handling for iOS Safari viewport behavior',
          foundIn: source.url
        });
      }
    }

    return limitations;
  }

  /**
   * Generate iOS-specific recommendations
   */
  generateIOSRecommendations(compatibilityIssues, iosSpecificIssues) {
    const recommendations = [];
    
    if (iosSpecificIssues.length > 0) {
      recommendations.push('📱 iOS Safari 15.5 Specific Issues:');
      iosSpecificIssues.forEach(issue => {
        recommendations.push(`   • ${issue.feature}: ${issue.issue}`);
      });
      recommendations.push('');
    }

    recommendations.push('🍎 iOS Safari 15.5 Best Practices:');
    recommendations.push('   • Always test audio/video playback with user interaction');
    recommendations.push('   • Use -webkit- prefixes for CSS features when needed');
    recommendations.push('   • Handle viewport meta tag carefully for responsive design');
    recommendations.push('   • Consider touch event handling differences');
    recommendations.push('   • Test file upload and camera access thoroughly');
    recommendations.push('   • Be aware of storage quota limitations');
    recommendations.push('   • Use HTTPS for geolocation and camera features');

    return recommendations;
  }

  /**
   * Generate recommendations based on findings
   */
  generateRecommendations(compatibilityIssues, iosSpecificIssues = []) {
    const recommendations = [];
    
    if (compatibilityIssues.length === 0 && iosSpecificIssues.length === 0) {
      recommendations.push('✅ No compatibility issues detected with current browser targets');
      return recommendations;
    }

    const featureCount = new Map();
    for (const issue of compatibilityIssues) {
      const feature = issue.message.split(' ')[0];
      featureCount.set(feature, (featureCount.get(feature) || 0) + 1);
    }

    if (compatibilityIssues.length > 0) {
      recommendations.push('🔧 Compatibility Issues Found:');
      
      // Most problematic features
      const sortedFeatures = Array.from(featureCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [feature, count] of sortedFeatures) {
        recommendations.push(`   • ${feature}: ${count} occurrence(s)`);
      }
      recommendations.push('');
    }

    if (iosSpecificIssues.length > 0) {
      recommendations.push('📱 iOS Safari Specific Concerns:');
      for (const issue of iosSpecificIssues) {
        recommendations.push(`   • ${issue.feature}: ${issue.issue}`);
      }
      recommendations.push('');
    }

    recommendations.push('💡 General Suggestions:');
    recommendations.push('   • Consider using polyfills for unsupported features');
    recommendations.push('   • Update browserslist configuration to match your target audience');
    recommendations.push('   • Use transpilation tools like Babel for newer JavaScript features');
    recommendations.push('   • Test on actual target browsers');

    return recommendations;
  }

  /**
   * Main analysis function
   */
  async analyze(url, browserTargets = null) {
    console.log(`🔍 Analyzing JavaScript compatibility for: ${url}`);
    
    // Update browser targets if provided
    if (browserTargets) {
      this.eslintConfig.baseConfig.settings.browserslist = browserTargets;
    }

    try {
      // Download webpage
      console.log('📥 Downloading webpage...');
      const html = await this.downloadPage(url);

      // Extract JavaScript
      console.log('🔎 Extracting JavaScript...');
      const javascriptSources = await this.extractJavaScript(html, url);
      console.log(`Found ${javascriptSources.length} JavaScript sources`);

      if (javascriptSources.length === 0) {
        console.log('ℹ️  No JavaScript found on this page');
        return { message: 'No JavaScript found on this page' };
      }

      // Setup temporary files
      console.log('📁 Setting up analysis files...');
      const filePaths = await this.setupTempFiles(javascriptSources);

      // Analyze compatibility
      console.log('🔬 Analyzing browser compatibility...');
      const { results, compatibilityIssues } = await this.analyzeCompatibility(filePaths);

      // Extract browser requirements
      const browserRequirements = this.extractBrowserRequirements(compatibilityIssues);

      // Generate report
      const report = this.generateReport(url, javascriptSources, compatibilityIssues, browserRequirements);

      return report;

    } catch (error) {
      throw new Error(`Analysis failed: ${error.message}`);
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }
}

// CLI Usage
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node analyzer.js <url> [browser-target1] [browser-target2] ...');
    console.log('');
    console.log('Examples:');
    console.log('  node analyzer.js https://example.com');
    console.log('  node analyzer.js https://example.com "last 2 Chrome versions" "IE 11"');
    console.log('  node analyzer.js https://example.com "last 1 version" "> 1%"');
    process.exit(1);
  }

  const url = args[0];
  const browserTargets = args.slice(1);

  console.log('🚀 JavaScript Compatibility Analyzer');
  console.log('=====================================');

  try {
    const analyzer = new JavaScriptCompatibilityAnalyzer();
    const report = await analyzer.analyze(url, browserTargets.length > 0 ? browserTargets : null);

    if (report.message) {
      console.log(report.message);
      return;
    }

    // Display results
    console.log('\n📊 Analysis Results');
    console.log('==================');
    console.log(`URL: ${report.url}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Total Scripts: ${report.summary.totalScripts}`);
    console.log(`Compatibility Issues: ${report.summary.compatibilityIssues}`);

    if (report.compatibilityIssues.length > 0) {
      console.log('\n⚠️  Compatibility Issues:');
      console.log('=========================');
      for (const issue of report.compatibilityIssues) {
        console.log(`${issue.severity.toUpperCase()}: ${issue.file}:${issue.line}:${issue.column}`);
        console.log(`  ${issue.message}`);
        console.log('');
      }
    }

    console.log('\n💭 Recommendations:');
    console.log('===================');
    for (const rec of report.recommendations) {
      console.log(rec);
    }

    // Save detailed report
    const reportPath = `compatibility-report-${Date.now()}.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = JavaScriptCompatibilityAnalyzer;

// Run if called directly
if (require.main === module) {
  main();
}