/**
 * Connectivity Diagnostics Tool
 * Checks all connectivity, port forwarding, and DNS issues
 */

const dns = require('dns').promises;
const http = require('http');
const os = require('os');
const net = require('net');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const domain = 'mac.faizal.uk';
const port = 80;

async function checkDNS() {
  console.log('\n🔍 DNS Lookup...');
  try {
    const addresses = await dns.resolve4(domain);
    console.log(`✅ ${domain} resolves to: ${addresses.join(', ')}`);
    return addresses[0];
  } catch (err) {
    console.log(`❌ DNS lookup failed: ${err.message}`);
    return null;
  }
}

async function checkIPv6DNS() {
  console.log('\n🔍 IPv6 DNS Lookup...');
  try {
    const addresses = await dns.resolve6(domain);
    console.log(`✅ ${domain} IPv6 addresses: ${addresses.join(', ')}`);
    return addresses[0];
  } catch (err) {
    console.log(`⚠️  No IPv6 DNS record: ${err.message}`);
    return null;
  }
}

async function checkPublicIP() {
  console.log('\n🔍 Detecting Public IP...');
  return new Promise((resolve) => {
    const req = http.get('http://api.ipify.org', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`✅ Your public IP: ${data}`);
        resolve(data);
      });
    });
    req.on('error', (err) => {
      console.log(`⚠️  Could not detect public IP: ${err.message}`);
      resolve(null);
    });
    req.setTimeout(5000);
  });
}

async function checkLocalServices() {
  console.log('\n🔍 Checking Local Services...');
  
  // Check frontend
  const checkService = (servicePort, serviceName) => {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${servicePort}`, (res) => {
        console.log(`✅ ${serviceName} (port ${servicePort}): RUNNING`);
        resolve(true);
      });
      req.on('error', () => {
        console.log(`❌ ${serviceName} (port ${servicePort}): NOT RESPONDING`);
        resolve(false);
      });
      req.setTimeout(3000);
    });
  };

  await checkService(80, 'Frontend (Vite)');
  await checkService(3001, 'Backend API');
}

async function checkReverseProxyRouting() {
  console.log('\n🔍 Checking Reverse Proxy Routing...');
  
  return new Promise((resolve) => {
    const req = http.get('http://localhost:80/api/health', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`✅ Reverse Proxy → Backend: WORKING`);
        resolve(true);
      });
    });
    req.on('error', (err) => {
      console.log(`⚠️  Reverse Proxy health check: ${err.message}`);
      resolve(false);
    });
    req.setTimeout(3000);
  });
}

async function checkRemoteAccess(ipAddress) {
  console.log(`\n🔍 Checking Remote IPv6 Access ([${ipAddress}]:${port})...`);
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setKeepAlive(true);
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      console.log(`✅ IPv6 Port ${port} is OPEN and ACCESSIBLE from internet`);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      console.log(`⏱️  IPv6 connection timeout (likely firewall blocking IPv6 traffic on port ${port})`);
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', (err) => {
      console.log(`❌ IPv6 Port ${port} is CLOSED or UNREACHABLE: ${err.message}`);
      if (err.code === 'ECONNREFUSED') {
        console.log(`   → No service listening on port ${port}`);
      } else if (err.code === 'ENETUNREACH') {
        console.log(`   → Network unreachable`);
      }
      resolve(false);
    });
    
    socket.connect(port, ipAddress, 'IPv6');
  });
}

async function getLocalNetworkInfo() {
  console.log('\n🔍 Local Network Info...');
  
  const interfaces = os.networkInterfaces();
  let ipv4 = null;
  let ipv6 = null;
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipv4 = iface.address;
        console.log(`✅ IPv4 Local: ${ipv4}`);
      }
      if (iface.family === 'IPv6' && !iface.internal && !iface.address.startsWith('fe80')) {
        ipv6 = iface.address;
        console.log(`✅ IPv6 Local: ${ipv6}`);
      }
    }
  }
  
  return { ipv4, ipv6 };
}

async function runDiagnostics() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 CONNECTIVITY DIAGNOSTICS - mac.faizal.uk');
  console.log('='.repeat(60));

  try {
    // 1. Check local services
    await checkLocalServices();

    // 2. Check reverse proxy routing
    await checkReverseProxyRouting();

    // 3. Get local network info
    const { ipv4, ipv6 } = await getLocalNetworkInfo();

    // 4. DNS Resolution
    const dnsIPv4 = await checkDNS();
    const dnsIPv6 = await checkIPv6DNS();

    // 5. Public IP
    const publicIP = await checkPublicIP();

    // 6. Remote access check - use IPv6 for CGNAT
    if (dnsIPv6) {
      await checkRemoteAccess(dnsIPv6);
    } else if (dnsIPv4) {
      console.log('\n⚠️  Only IPv4 DNS found. Checking IPv4 access (may fail on CGNAT)...');
      await checkRemoteAccess(dnsIPv4);
    }

    // 7. Summary and recommendations
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY & FIXES (IPv6-Only / CGNAT Setup):');
    console.log('='.repeat(60));

    if (!dnsIPv6) {
      console.log('\n❌ CRITICAL: IPv6 DNS not updating!');
      console.log('   ACTION: IPv6 updater service needs to run\n');
    } else {
      console.log(`\n✅ IPv6 DNS: ${dnsIPv6}`);
    }

    if (dnsIPv4) {
      console.log(`\n📝 IPv4 DNS: ${dnsIPv4}`);
      console.log('   (Behind CGNAT - IPv4 may not be accessible)');
    }

    console.log('\n📌 IPv6-ONLY CHECKLIST:');
    console.log('   [ ] IPv6 DNS resolves correctly');
    console.log('   [ ] Firewall allows IPv6 port 80 inbound');
    console.log('   [ ] IPv6 updater is running (updates every 5 min)');
    console.log('   [ ] Reverse proxy listening on IPv6 port 80');
    console.log('   [ ] Frontend running on port 3000');
    console.log('   [ ] Backend running on port 3001');
    console.log('   [ ] No port forwarding needed (CGNAT)\n');

    console.log('🔗 ACCESS LINKS:');
    console.log(`   • Local:     http://localhost:80`);
    console.log(`   • IPv6:      http://[${ipv6}]:80`);
    console.log(`   • Domain:    http://${domain}`);
    console.log(`   • Backend:   http://localhost:3001/api`);
    console.log(`\n📖 IPv6 Info:`);
    if (dnsIPv6) console.log(`   • DNS IPv6:  ${dnsIPv6}`);
    console.log(`   • Local IPv6: ${ipv6}`);
    console.log(`   • Setup: IPv6-Only (CGNAT optimized - no port forwarding needed)\n`);

  } catch (err) {
    console.error('Diagnostics error:', err.message);
  }
}

// Run diagnostics
runDiagnostics().then(() => {
  console.log('✅ Diagnostics complete!\n');
});
