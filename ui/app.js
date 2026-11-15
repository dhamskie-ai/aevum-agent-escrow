import { BrowserProvider, Contract, Interface, formatUnits, parseUnits, isAddress } from 'ethers';

const CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
const TOKEN_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483';
const CHAIN_ID = 44005;
const RPC_URL = 'https://rpc-test.qday.info';
const EXPLORER_URL = 'https://explorer-test.qday.info';
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

const ABI = [
  'function createEscrow(address worker,address arbiter,uint256 amount,uint256 deadline) returns (uint256 id)',
  'function markDelivered(uint256 id)',
  'function release(uint256 id)',
  'function refund(uint256 id)',
  'function dispute(uint256 id)',
  'function resolveByArbiter(uint256 id,uint256 workerAmount)',
  'function getEscrow(uint256 id) view returns ((uint256 id,address payer,address worker,address arbiter,uint256 amount,uint256 deadline,uint8 status))',
  'function nextEscrowId() view returns (uint256)',
  'event EscrowCreated(uint256 indexed id,address indexed payer,address indexed worker,address arbiter,uint256 amount,uint256 deadline)',
  'event Delivered(uint256 indexed id)',
  'event Released(uint256 indexed id,address indexed worker,uint256 amount)',
  'event Refunded(uint256 indexed id,address indexed payer,uint256 amount)',
  'event Disputed(uint256 indexed id,address indexed initiator)',
  'event Resolved(uint256 indexed id,uint256 workerAmount,uint256 payerAmount)',
];
const TOKEN_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];
const STATUS = ['Active', 'Delivered', 'Released', 'Disputed', 'Resolved', 'Refunded'];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const $ = (id) => document.getElementById(id);
const connectButton = $('connect-button');
const createButton = $('create-button');
const list = $('escrow-list');
let provider;
let signer;
let account;
let escrow;
let token;
let busy = false;

function contractIsConfigured() {
  return isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function displayAmount(value) {
  return Number(formatUnits(value, 6)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function setMessage(message, kind = 'success') {
  const target = $('app-message');
  target.textContent = message;
  target.className = `notice${kind === 'error' ? ' notice-error' : ''}`;
  target.hidden = !message;
}

function humanError(error) {
  const raw = error?.shortMessage || error?.reason || error?.message || 'Transaksi gagal.';
  const reason = raw.match(/reason string '([^']+)'/)?.[1] || raw.match(/execution reverted: ([^\n]+)/)?.[1];
  const messages = {
    'amount is zero': 'Jumlah harus lebih dari nol.',
    'deadline not future': 'Batas waktu harus berada di masa depan.',
    'worker is zero': 'Alamat worker tidak boleh kosong.',
    'arbiter is zero': 'Alamat arbiter tidak boleh kosong.',
    'party cannot be payer': 'Wallet payer tidak boleh menjadi worker atau arbiter.',
    'only worker': 'Hanya worker yang dapat menandai pekerjaan selesai.',
    'not delivered': 'Pekerjaan belum ditandai selesai.',
    'not authorized': 'Aksi ini belum diizinkan untuk wallet ini.',
    'only payer': 'Hanya payer yang dapat meminta refund.',
    'deadline not reached': 'Batas waktu refund belum tercapai.',
    'only parties': 'Hanya payer atau worker yang dapat membuka dispute.',
    'not disputable': 'Escrow ini tidak dapat disengketakan pada status sekarang.',
    'only arbiter': 'Hanya arbiter yang dapat menyelesaikan dispute.',
    'not disputed': 'Escrow ini belum berstatus dispute.',
    'worker amount exceeds escrow': 'Jumlah untuk worker melebihi dana escrow.',
    'insufficient funds': 'Saldo tQDAY tidak cukup untuk biaya jaringan.',
    'user rejected': 'Transaksi dibatalkan di wallet.',
  };
  const normalized = (reason || raw).toLowerCase();
  const known = Object.entries(messages).find(([key]) => normalized.includes(key));
  if (known) return messages[known[0]];
  if (/user rejected|user denied|rejected the request/i.test(raw)) return 'Transaksi dibatalkan di wallet.';
  if (/insufficient funds/i.test(raw)) return 'Saldo tQDAY tidak cukup untuk biaya jaringan.';
  return 'Transaksi gagal. Periksa koneksi, saldo, izin token, dan apakah aksi sesuai status escrow.';
}

async function ensureChain() {
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_HEX,
        chainName: 'Aevum Testnet',
        nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: [EXPLORER_URL],
      }],
    });
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  }
}

function setConnectedUI(connected) {
  connectButton.textContent = connected ? shortAddress(account) : 'Connect MetaMask';
  connectButton.title = connected ? account : 'Hubungkan wallet MetaMask';
  createButton.disabled = !connected || !contractIsConfigured() || busy;
  $('network-indicator').textContent = connected ? 'Aevum testnet · Terhubung' : 'Aevum testnet';
}

async function connect() {
  if (!window.ethereum) {
    setMessage('MetaMask tidak ditemukan. Pasang atau buka MetaMask untuk melanjutkan.', 'error');
    return;
  }
  try {
    await ensureChain();
    provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    if (!accounts.length) throw new Error('wallet kosong');
    account = accounts[0];
    signer = await provider.getSigner();
    token = new Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    escrow = contractIsConfigured() ? new Contract(CONTRACT_ADDRESS, ABI, signer) : null;
    setConnectedUI(true);
    if (!contractIsConfigured()) $('deployment-notice').hidden = false;
    await refreshAll();
    if (!contractIsConfigured()) setMessage('Wallet terhubung. Kontrak belum di-deploy, isi alamat setelah deploy.', 'error');
  } catch (error) {
    setMessage(humanError(error), 'error');
  }
}

async function refreshBalances() {
  if (!provider || !account) return;
  try {
    const [tokenBalance, nativeBalance] = await Promise.all([token.balanceOf(account), provider.getBalance(account)]);
    $('token-balance').textContent = `${displayAmount(tokenBalance)} tUSD8`;
    $('native-balance').textContent = `${Number(formatUnits(nativeBalance, 18)).toLocaleString('id-ID', { maximumFractionDigits: 5 })} tQDAY`;
  } catch {
    $('token-balance').textContent = 'Tidak tersedia';
    $('native-balance').textContent = 'Tidak tersedia';
  }
}

function makeAction(label, onClick, className = 'button-quiet') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button action-button ${className}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function addTxEntry(row, hash) {
  const entry = document.createElement('div');
  entry.className = 'tx-entry';
  const label = document.createElement('span');
  label.textContent = 'Transaksi';
  const hashText = document.createElement('span');
  hashText.className = 'tx-hash';
  hashText.textContent = hash;
  const link = document.createElement('a');
  link.href = `${EXPLORER_URL.replace(/\/$/, '')}/tx/${hash}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'Lihat ↗';
  entry.append(label, hashText, link);
  row.append(entry);
}

async function submitAction(row, label, method, args = []) {
  if (busy) return;
  busy = true;
  setConnectedUI(true);
  try {
    const tx = await escrow[method](...args);
    addTxEntry(row, tx.hash);
    setMessage(`${label} dikirim. Menunggu konfirmasi jaringan…`);
    await tx.wait();
    setMessage(`${label} berhasil. Transaction hash: ${tx.hash}`);
    await refreshAll();
  } catch (error) {
    setMessage(humanError(error), 'error');
  } finally {
    busy = false;
    setConnectedUI(Boolean(account));
  }
}

function appendResolveControl(area, row, id, amount) {
  const wrapper = document.createElement('label');
  wrapper.className = 'resolve-field';
  wrapper.textContent = 'Worker menerima (tUSD8)';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = formatUnits(amount, 6);
  input.step = '0.000001';
  input.placeholder = `maks. ${displayAmount(amount)}`;
  wrapper.append(input);
  area.append(wrapper, makeAction('Resolve', async () => {
    try {
      const workerAmount = parseUnits(input.value || '0', 6);
      if (workerAmount > amount) throw new Error('worker amount exceeds escrow');
      await submitAction(row, 'Resolve', 'resolveByArbiter', [id, workerAmount]);
    } catch (error) {
      setMessage(error.message === 'worker amount exceeds escrow' ? 'Jumlah untuk worker melebihi dana escrow.' : 'Masukkan jumlah worker yang valid (0 sampai total escrow).', 'error');
    }
  }, 'button-accent'));
}

async function refreshEscrows() {
  if (!escrow) return;
  try {
    const count = Number(await escrow.nextEscrowId());
    const items = await Promise.all(Array.from({ length: Math.max(0, count - 1) }, (_, index) => escrow.getEscrow(index + 1)));
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Belum ada escrow pada kontrak ini.';
      list.append(empty);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    for (const item of items.reverse()) {
      const [id, payer, worker, arbiter, amount, deadline, statusValue] = item;
      const status = STATUS[Number(statusValue)] || 'Unknown';
      const deadlineNumber = Number(deadline);
      const pastDeadline = now >= deadlineNumber;
      const row = document.createElement('article');
      row.className = 'escrow-row';
      const primary = document.createElement('div');
      primary.className = 'escrow-primary';
      const idText = document.createElement('span');
      idText.className = 'escrow-id';
      idText.textContent = `Escrow #${id}`;
      const amountText = document.createElement('span');
      amountText.className = 'escrow-amount';
      amountText.textContent = `${displayAmount(amount)} tUSD8`;
      primary.append(idText, amountText);
      const details = document.createElement('div');
      details.className = 'escrow-meta';
      const statusBadge = document.createElement('span');
      statusBadge.className = `status status-${status.toLowerCase()}`;
      statusBadge.textContent = status;
      const dateText = document.createElement('span');
      dateText.className = 'escrow-detail';
      dateText.textContent = `Batas waktu: ${new Date(deadlineNumber * 1000).toLocaleString('id-ID')}`;
      details.append(statusBadge, dateText);
      const parties = document.createElement('div');
      parties.className = 'escrow-meta';
      for (const [name, address] of [['Payer', payer], ['Worker', worker], ['Arbiter', arbiter]]) {
        const detail = document.createElement('span');
        detail.className = 'escrow-detail';
        detail.textContent = `${name}: ${shortAddress(address)}`;
        detail.title = address;
        parties.append(detail);
      }
      const actions = document.createElement('div');
      actions.className = 'action-area';
      const isPayer = account?.toLowerCase() === payer.toLowerCase();
      const isWorker = account?.toLowerCase() === worker.toLowerCase();
      const isArbiter = account?.toLowerCase() === arbiter.toLowerCase();
      if (status === 'Active' && isWorker) actions.append(makeAction('Mark delivered', () => submitAction(row, 'Mark delivered', 'markDelivered', [id]), 'button-accent'));
      if (status === 'Delivered' && (isPayer || pastDeadline)) actions.append(makeAction('Release', () => submitAction(row, 'Release', 'release', [id]), 'button-accent'));
      if ((status === 'Active' || status === 'Delivered') && (isPayer || isWorker)) actions.append(makeAction('Dispute', () => submitAction(row, 'Dispute', 'dispute', [id])));
      if (status === 'Active' && isPayer && pastDeadline) actions.append(makeAction('Refund', () => submitAction(row, 'Refund', 'refund', [id])));
      if (status === 'Disputed' && isArbiter) appendResolveControl(actions, row, id, amount);
      row.append(primary, details, parties, actions);
      list.append(row);
    }
  } catch (error) {
    list.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = `Tidak dapat memuat escrow: ${humanError(error)}`;
    list.append(empty);
  }
}

async function refreshAll() {
  await refreshBalances();
  if (escrow) await refreshEscrows();
}

async function createEscrow(event) {
  event.preventDefault();
  if (!signer || !escrow || busy) return;
  const worker = $('worker-input').value.trim();
  const arbiter = $('arbiter-input').value.trim();
  const amountText = $('amount-input').value.trim();
  const dateValue = $('deadline-input').value;
  try {
    if (!isAddress(worker) || !isAddress(arbiter)) throw new Error('Alamat worker dan arbiter harus berupa alamat EVM yang valid.');
    if (worker.toLowerCase() === account.toLowerCase() || arbiter.toLowerCase() === account.toLowerCase()) throw new Error('Wallet payer tidak boleh menjadi worker atau arbiter.');
    const amount = parseUnits(amountText, 6);
    if (amount <= 0n) throw new Error('Jumlah harus lebih dari nol.');
    const deadline = Math.floor(new Date(dateValue).getTime() / 1000);
    if (!Number.isFinite(deadline) || deadline <= Math.floor(Date.now() / 1000)) throw new Error('Batas waktu harus berada di masa depan.');
    busy = true;
    setConnectedUI(true);
    const allowance = await token.allowance(account, CONTRACT_ADDRESS);
    if (allowance < amount) {
      setMessage('Meminta persetujuan token tUSD8…');
      const approveTx = await token.approve(CONTRACT_ADDRESS, amount);
      setMessage(`Persetujuan token dikirim: ${approveTx.hash}. Menunggu konfirmasi…`);
      await approveTx.wait();
      setMessage(`Persetujuan berhasil: ${approveTx.hash}. Membuat escrow…`);
    }
    const tx = await escrow.createEscrow(worker, arbiter, amount, deadline);
    setMessage(`Pembuatan escrow dikirim. Transaction hash: ${tx.hash}`);
    await tx.wait();
    $('create-form').reset();
    setMessage(`Escrow berhasil dibuat. Transaction hash: ${tx.hash}`);
    await refreshAll();
  } catch (error) {
    setMessage(error.message && !error.code ? error.message : humanError(error), 'error');
  } finally {
    busy = false;
    setConnectedUI(Boolean(account));
  }
}

connectButton.addEventListener('click', connect);
$('create-form').addEventListener('submit', createEscrow);
$('refresh-button').addEventListener('click', async () => {
  if (!account) return setMessage('Hubungkan wallet sebelum memuat daftar escrow.', 'error');
  await refreshAll();
});

if (!contractIsConfigured()) {
  $('deployment-notice').hidden = false;
  list.innerHTML = '<div class="empty-state">Kontrak belum di-deploy. Daftar escrow tersedia setelah alamat kontrak diatur.</div>';
}
setConnectedUI(false);

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', () => window.location.reload());
  window.ethereum.on?.('chainChanged', () => window.location.reload());
}
