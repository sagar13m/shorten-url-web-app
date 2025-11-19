// pages/index.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppBar, Box, Button, Container, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, InputAdornment, LinearProgress, Paper, Skeleton, Snackbar, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Toolbar, Tooltip, Typography,
  TablePagination, MenuItem, Select, FormControl, InputLabel, TableSortLabel, Divider, Chip,
  Card, CardContent, Fab, Slide, Alert, useMediaQuery, Drawer, List, ListItem, ListItemText, ListItemIcon
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import QrCodeIcon from "@mui/icons-material/QrCode";
import DownloadIcon from "@mui/icons-material/FileDownload";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import BarChartIcon from "@mui/icons-material/BarChart";
import CloseIcon from "@mui/icons-material/Close";
import QRCode from "qrcode";

const CODE_REGEX = /^[A-Za-z0-9]{6,8}$/;
const URL_REGEX = /^(https?:\/\/).+/i;

function formatDate(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function relativeTimeFrom(iso) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
function downloadCsv(rows, filename = "links.csv") {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v = "") => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(",")]
    .concat(rows.map((r) => headers.map((h) => escape(r[h])).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function Dashboard() {
  const isMobile = useMediaQuery('(max-width:768px)');
  const [links, setLinks] = useState([]);              // <- empty initial, load from backend
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [orderBy, setOrderBy] = useState("createdAt");
  const [orderDir, setOrderDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(8);
  const [copyConfirm, setCopyConfirm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [snack, setSnack] = useState(null);
  const [qrTarget, setQrTarget] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const isUrlValid = useMemo(() => URL_REGEX.test(url.trim()), [url]);
  const isCodeValid = useMemo(() => { if (!code) return true; return CODE_REGEX.test(code.trim()); }, [code]);

  // Load links from backend
  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const normalized = (data || []).map((l) => ({
        code: l.code,
        url: l.url,
        clicks: typeof l.clicks === "number" ? l.clicks : Number(l.clicks || 0),
        lastClickedAt: l.lastClickedAt || null,
        createdAt: l.createdAt || null,
      }));
      setLinks(normalized);
    } catch (err) {
      console.error("fetchLinks error:", err);
      setSnack({ severity: "error", message: "Failed to load links from backend" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  useEffect(() => {
    if (!url) { setFormError(""); return; }
    if (!isUrlValid) setFormError("URL must start with http:// or https://");
    else if (code && !isCodeValid) setFormError("Code must be 6–8 alphanumeric characters.");
    else setFormError("");
  }, [url, code, isUrlValid, isCodeValid]);

  // QR generation client-side
  useEffect(() => {
    let cancelled = false;
    async function gen() {
      if (!qrTarget) { setQrDataUrl(null); setQrLoading(false); return; }
      setQrLoading(true);
      try {
        const short = (base ? `${base}/` : `${origin}/`) + qrTarget.code;
        const dataUrl = await QRCode.toDataURL(short, { margin: 2, width: 520, color: { dark: "#111827", light: "#ffffff" }});
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (err) {
        console.error("QR gen failed", err);
        setSnack({ severity: "error", message: "Failed to generate QR" });
        setQrDataUrl(null);
      } finally { if (!cancelled) setQrLoading(false); }
    }
    gen(); return () => { cancelled = true; };
  }, [qrTarget, base, origin]);

  // Create link (POST to backend). Optimistic update & reload fallback.
  const handleAdd = useCallback(async (e) => {
    e?.preventDefault?.();
    if (!isUrlValid) { setFormError("Enter a valid URL (http/https)."); return; }
    if (!isCodeValid) { setFormError("Custom code invalid (6-8 alphanumeric)."); return; }
    setSubmitting(true); setFormError("");
    const payload = { url: url.trim(), code: code.trim() || undefined };
    try {
      const res = await fetch("/api/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === 201) {
        const created = await res.json();
        const newLink = { code: created.code, url: created.url, clicks: 0, lastClickedAt: null, createdAt: new Date().toISOString() };
        setLinks((prev) => [newLink, ...prev]);
        setUrl(""); setCode(""); setCreateDrawerOpen(false);
        setSnack({ severity: "success", message: `Created ${created.code}` });
      } else {
        const err = await res.json().catch(()=>({}));
        setFormError(err.error || "Failed to create link (server)");
        // refresh list to show true state
        await fetchLinks();
      }
    } catch (err) {
      console.error("create error", err);
      setFormError("Network error creating link");
      await fetchLinks();
    } finally { setSubmitting(false); }
  }, [url, code, isUrlValid, isCodeValid, fetchLinks]);

  // Delete link (DELETE to backend)
  const handleDeleteConfirm = useCallback(async () => {
    const codeToDelete = deleteTarget;
    setDeleteTarget(null);
    if (!codeToDelete) return;
    const prev = links;
    setLinks((l) => l.filter((x) => x.code !== codeToDelete)); // optimistic
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(codeToDelete)}`, { method: "DELETE" });
      if (res.ok) { setSnack({ severity: "success", message: `${codeToDelete} deleted` }); }
      else {
        const err = await res.json().catch(()=>({}));
        setLinks(prev); setSnack({ severity: "error", message: err.error || "Delete failed" });
      }
    } catch (err) {
      console.error("delete error", err); setLinks(prev); setSnack({ severity: "error", message: "Network error deleting" });
    }
  }, [deleteTarget, links]);

  // Copy short link
  const handleCopy = useCallback((c) => {
    const full = (base || origin) + `/${c}`;
    navigator.clipboard.writeText(full).then(()=> {
      setCopyConfirm(c); setSnack({ severity: "success", message: "Copied to clipboard" });
      setTimeout(()=>setCopyConfirm(null), 1600);
    }).catch(()=> setSnack({ severity: "error", message: "Copy failed" }));
  }, [base, origin]);

  const filtered = useMemo(() => {
    const q = (debouncedSearch || "").trim().toLowerCase();
    return links.filter(l => {
      if (!q) return true;
      return l.code.toLowerCase().includes(q) || (l.url||"").toLowerCase().includes(q);
    }).sort((a,b) => {
      let A = a[orderBy] ?? 0; let B = b[orderBy] ?? 0;
      if (orderBy === "createdAt") { A = A?new Date(A).getTime():0; B = B?new Date(B).getTime():0; }
      if (A < B) return orderDir === "asc" ? -1 : 1;
      if (A > B) return orderDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [links, debouncedSearch, orderBy, orderDir]);

  const totalRows = filtered.length;
  const pageData = filtered.slice(page*rowsPerPage, page*rowsPerPage + rowsPerPage);
  const totalClicks = links.reduce((s,l)=> s + (l.clicks||0), 0);
  const handleRequestSort = (property) => { const isAsc = orderBy===property && orderDir==="asc"; setOrderDir(isAsc?"desc":"asc"); setOrderBy(property); };
  const exportVisibleCsv = () => downloadCsv(pageData.map(r=>({ code: r.code, url: r.url, clicks: r.clicks||0, lastClickedAt: r.lastClickedAt||"", createdAt: r.createdAt||"" })), "tinylink-visible.csv");

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", pb: isMobile ? 10 : 4 }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <Toolbar sx={{ gap:2 }}>
          <LinkIcon sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight:700, fontSize:{ xs:'1.1rem', sm:'1.25rem' } }}>TinyLink</Typography>

          {!isMobile ? (
            <TextField size="small" placeholder="Search by code or URL" value={search}
              onChange={(e)=>{ setSearch(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon/></InputAdornment>) }}
              sx={{ bgcolor: "rgba(255,255,255,0.15)", borderRadius:2, width:{ sm:280, md:360 }, '& .MuiOutlinedInput-root': { '& fieldset': { border: 'none' }, color:'white', '&::placeholder': { color:'rgba(255,255,255,0.7)' } } }}
            />
          ) : (
            <IconButton color="inherit" onClick={()=> setSearchOpen(!searchOpen)}><SearchIcon/></IconButton>
          )}

          <Button color="inherit" onClick={fetchLinks} sx={{ ml: 1 }}>Refresh</Button>
        </Toolbar>

        <Slide direction="down" in={searchOpen && isMobile} mountOnEnter unmountOnExit>
          <Box sx={{ px:2, pb:2 }}>
            <TextField fullWidth size="small" placeholder="Search by code or URL" value={search}
              onChange={(e)=>{ setSearch(e.target.value); setPage(0); }}
              InputProps={{ startAdornment:(<InputAdornment position="start"><SearchIcon/></InputAdornment>), endAdornment:(<InputAdornment position="end"><IconButton size="small" onClick={()=>setSearchOpen(false)}><CloseIcon/></IconButton></InputAdornment>) }}
              sx={{ bgcolor: "rgba(255,255,255,0.15)", borderRadius:2, '& .MuiOutlinedInput-root': { '& fieldset': { border: 'none' }, color:'white' } }}
            />
          </Box>
        </Slide>
      </AppBar>

      <Container maxWidth="lg" sx={{ py:{ xs:2, sm:3, md:4 } }}>
        <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'repeat(2,1fr)', sm:'repeat(3,1fr)' }, gap:2, mb:3 }}>
          <Card elevation={0} sx={{ borderRadius:3, border:'1px solid #e5e7eb' }}>
            <CardContent><Typography variant="body2" color="text.secondary">Total Links</Typography><Typography variant="h4" fontWeight={700} color="primary.main">{links.length}</Typography></CardContent>
          </Card>
          <Card elevation={0} sx={{ borderRadius:3, border:'1px solid #e5e7eb' }}>
            <CardContent><Typography variant="body2" color="text.secondary">Total Clicks</Typography><Typography variant="h4" fontWeight={700} color="success.main">{totalClicks}</Typography></CardContent>
          </Card>
          <Card elevation={0} sx={{ borderRadius:3, border:'1px solid #e5e7eb', display:{ xs:'none', sm:'block' } }}>
            <CardContent><Typography variant="body2" color="text.secondary">Avg. Clicks</Typography><Typography variant="h4" fontWeight={700} color="info.main">{links.length>0?Math.round(totalClicks/links.length):0}</Typography></CardContent>
          </Card>
        </Box>

        {!isMobile && (
          <Paper sx={{ p:3, mb:3, borderRadius:3, border:'1px solid #e5e7eb', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }} elevation={0}>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}><AddIcon color="primary"/><Typography variant="h6" fontWeight={600}>Create a short link</Typography></Stack>
            <Box component="form" onSubmit={handleAdd} noValidate>
              <Stack spacing={2}>
                <TextField label="Target URL" placeholder="https://example.com/..." value={url} onChange={(e)=>setUrl(e.target.value)} required size="small" fullWidth error={!!formError && !isUrlValid} helperText={!isUrlValid && url ? "URL must start with http:// or https://" : " "} sx={{ '& .MuiOutlinedInput-root': { borderRadius:2 } }} />
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <TextField label="Custom Code (optional)" placeholder="abc123" value={code} onChange={(e)=>setCode(e.target.value)} size="small" helperText={!isCodeValid && code ? "6-8 letters or numbers" : "Optional"} error={!!formError && !!code && !isCodeValid} sx={{ flex:1, '& .MuiOutlinedInput-root': { borderRadius:2 } }} />
                  <Stack direction="row" spacing={1}>
                    <Button type="submit" variant="contained" disabled={submitting || !isUrlValid || !isCodeValid} sx={{ borderRadius:2, px:3, textTransform:'none', fontWeight:600 }}>{submitting?"Creating...":"Create"}</Button>
                    <Button variant="outlined" onClick={()=>{ setUrl(""); setCode(""); setFormError(""); }} sx={{ borderRadius:2, textTransform:'none' }}>Reset</Button>
                  </Stack>
                </Stack>
              </Stack>
              {formError && <Alert severity="error" sx={{ mt:2, borderRadius:2 }}>{formError}</Alert>}
            </Box>
          </Paper>
        )}

        <Paper elevation={0} sx={{ borderRadius:3, border:'1px solid #e5e7eb', overflow:'hidden' }}>
          {loading && <LinearProgress />}

          <Box sx={{ display:"flex", alignItems:"center", justifyContent:"space-between", p:{ xs:2, sm:2.5 }, flexWrap:'wrap', gap:2 }}>
            <Stack direction="row" alignItems="center" spacing={1}><BarChartIcon color="primary"/><Typography variant="h6" fontWeight={600}>Links</Typography></Stack>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              {!isMobile && <FormControl size="small" sx={{ minWidth:180 }}><InputLabel>Sort</InputLabel><Select value={`${orderBy}:${orderDir}`} label="Sort" onChange={(e)=>{ const [k,d] = e.target.value.split(":"); setOrderBy(k); setOrderDir(d); }} sx={{ borderRadius:2 }}>
                <MenuItem value="createdAt:desc">Newest</MenuItem>
                <MenuItem value="createdAt:asc">Oldest</MenuItem>
                <MenuItem value="clicks:desc">Most clicks</MenuItem>
                <MenuItem value="clicks:asc">Fewest clicks</MenuItem>
                <MenuItem value="code:asc">Code A → Z</MenuItem>
                <MenuItem value="code:desc">Code Z → A</MenuItem>
              </Select></FormControl>}
              <Chip label={`${totalRows} total`} color="primary" variant="outlined" sx={{ fontWeight:600 }} />
              {!isMobile && <Button size="small" startIcon={<DownloadIcon/>} onClick={exportVisibleCsv} sx={{ textTransform:'none' }}>Export</Button>}
            </Stack>
          </Box>

          <Divider />

          {isMobile ? (
            <Box sx={{ p:2 }}>
              {pageData.map((l)=>(
                <Card key={l.code} sx={{ mb:2, borderRadius:2, border:'1px solid #e5e7eb' }} elevation={0}>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Chip label={l.code} size="small" sx={{ fontFamily:'monospace', fontWeight:700, bgcolor:'primary.50' }} />
                        <Chip label={`${l.clicks} clicks`} size="small" color="success" variant="outlined" />
                      </Stack>
                      <Typography variant="body2" sx={{ color:'primary.main', wordBreak:'break-all', fontSize:'0.85rem' }}>{l.url}</Typography>
                      <Typography variant="caption" color="text.secondary">{l.lastClickedAt ? relativeTimeFrom(l.lastClickedAt) : "Never clicked"}</Typography>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton size="small" onClick={()=>handleCopy(l.code)} sx={{ bgcolor:'action.hover' }}>{copyConfirm===l.code ? <CheckIcon color="success" fontSize="small"/> : <ContentCopyIcon fontSize="small" />}</IconButton>
                        <IconButton size="small" onClick={()=>setQrTarget(l)} sx={{ bgcolor:'action.hover' }}><QrCodeIcon fontSize="small"/></IconButton>
                        <IconButton size="small" color="error" onClick={()=>setDeleteTarget(l.code)} sx={{ bgcolor:'action.hover' }}><DeleteIcon fontSize="small"/></IconButton>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {pageData.length===0 && <Box sx={{ textAlign:'center', py:8 }}>
                <LinkIcon sx={{ fontSize:48, color:'text.secondary', mb:2 }} />
                <Typography variant="h6" gutterBottom>No links yet</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb:3 }}>Create your first short link</Typography>
                <Button variant="contained" onClick={()=>setCreateDrawerOpen(true)} sx={{ borderRadius:2, textTransform:'none' }}>Get started</Button>
              </Box>}
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><TableSortLabel active={orderBy==="code"} direction={orderBy==="code"?orderDir:"asc"} onClick={()=>handleRequestSort("code")}>Code</TableSortLabel></TableCell>
                    <TableCell>Target URL</TableCell>
                    <TableCell><TableSortLabel active={orderBy==="clicks"} direction={orderBy==="clicks"?orderDir:"desc"} onClick={()=>handleRequestSort("clicks")}>Clicks</TableSortLabel></TableCell>
                    <TableCell><TableSortLabel active={orderBy==="createdAt"} direction={orderBy==="createdAt"?orderDir:"desc"} onClick={()=>handleRequestSort("createdAt")}>Last clicked</TableSortLabel></TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageData.map((l)=>(
                    <TableRow key={l.code} hover>
                      <TableCell><Chip label={l.code} size="small" sx={{ fontFamily:'monospace', fontWeight:700, bgcolor:'primary.50' }} /></TableCell>
                      <TableCell sx={{ maxWidth:400 }}><Tooltip title={l.url}><a href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none', color:'var(--mui-palette-primary-main,#1976d2)', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.url}</a></Tooltip></TableCell>
                      <TableCell><Chip label={l.clicks ?? 0} size="small" color="success" variant="outlined" /></TableCell>
                      <TableCell><Tooltip title={l.lastClickedAt ? formatDate(l.lastClickedAt) : "Never clicked"}><Typography variant="body2" color="text.secondary">{ l.lastClickedAt ? relativeTimeFrom(l.lastClickedAt) : "—" }</Typography></Tooltip></TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Copy"><IconButton size="small" onClick={()=>handleCopy(l.code)}>{copyConfirm===l.code? <CheckIcon color="success"/> : <ContentCopyIcon/>}</IconButton></Tooltip>
                          <Tooltip title="QR"><IconButton size="small" onClick={()=>setQrTarget(l)}><QrCodeIcon/></IconButton></Tooltip>
                          <Tooltip title="Stats"><IconButton size="small" component="a" href={`/code/${l.code}`}><OpenInNewIcon/></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={()=>setDeleteTarget(l.code)}><DeleteIcon/></IconButton></Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pageData.length===0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py:8 }}>
                    <LinkIcon sx={{ fontSize:48, color:'text.secondary', mb:2}} />
                    <Typography variant="h6" gutterBottom>No links yet</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb:3 }}>Create a short link using the form above</Typography>
                  </TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {totalRows > 0 && <TablePagination component="div" count={totalRows} page={page} onPageChange={(_,p)=>setPage(p)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e)=>{ setRowsPerPage(parseInt(e.target.value,10)); setPage(0); }} rowsPerPageOptions={isMobile?[5,10]:[5,8,12,20]} />}
        </Paper>
      </Container>

      {isMobile && <Fab color="primary" sx={{ position:"fixed", bottom:16, right:16, boxShadow:'0 8px 24px rgba(0,0,0,0.15)'}} onClick={()=>setCreateDrawerOpen(true)}><AddIcon/></Fab>}

      <Drawer anchor="bottom" open={createDrawerOpen} onClose={()=>setCreateDrawerOpen(false)} PaperProps={{ sx:{ borderTopLeftRadius:16, borderTopRightRadius:16, maxHeight:'90vh' }}}>
        <Box sx={{ p:3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}><Typography variant="h6" fontWeight={600}>Create short link</Typography><IconButton onClick={()=>setCreateDrawerOpen(false)}><CloseIcon/></IconButton></Stack>
          <Box component="form" onSubmit={handleAdd} noValidate>
            <Stack spacing={2.5}>
              <TextField label="Target URL" placeholder="https://example.com/..." value={url} onChange={(e)=>setUrl(e.target.value)} required fullWidth error={!!formError && !isUrlValid} helperText={!isUrlValid && url ? "URL must start with http:// or https://" : " "} sx={{ '& .MuiOutlinedInput-root': { borderRadius:2 }}} />
              <TextField label="Custom Code (optional)" placeholder="abc123" value={code} onChange={(e)=>setCode(e.target.value)} fullWidth helperText={!isCodeValid && code ? "6-8 letters or numbers" : "Optional"} error={!!formError && !!code && !isCodeValid} sx={{ '& .MuiOutlinedInput-root': { borderRadius:2 }}} />
              {formError && <Alert severity="error" sx={{ borderRadius:2 }}>{formError}</Alert>}
              <Stack direction="row" spacing={2}>
                <Button type="submit" variant="contained" fullWidth disabled={submitting || !isUrlValid || !isCodeValid} sx={{ borderRadius:2, py:1.5, textTransform:'none', fontWeight:600 }}>{submitting?"Creating...":"Create Link"}</Button>
                <Button variant="outlined" onClick={()=>{ setUrl(""); setCode(""); setFormError(""); }} sx={{ borderRadius:2, textTransform:'none' }}>Reset</Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Dialog open={!!qrTarget} onClose={()=>setQrTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>QR Code for {qrTarget?.code}</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign:'center', py:2 }}>
            {qrLoading ? <Skeleton variant="rectangular" width={200} height={200} /> : qrDataUrl ? <img src={qrDataUrl} alt="QR Code" style={{ width:'100%', maxWidth:200 }} /> : <Typography>No QR</Typography>}
            <Typography variant="body2" color="text.secondary" sx={{ mt:2 }}>{origin ? `${origin}/${qrTarget?.code}` : `/${qrTarget?.code}`}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setQrTarget(null)}>Close</Button>
          <Button variant="contained" startIcon={<DownloadIcon/>} onClick={() => { if (!qrDataUrl) { setSnack({ severity:'error', message:'QR not ready' }); return; } const a=document.createElement('a'); a.href=qrDataUrl; a.download=`tinylink-${qrTarget.code}.png`; document.body.appendChild(a); a.click(); a.remove(); setSnack({ severity:'success', message:'QR downloaded' }); }}>Download</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={()=>setDeleteTarget(null)}>
        <DialogTitle>Delete Link?</DialogTitle>
        <DialogContent><DialogContentText>Are you sure you want to delete <strong>{deleteTarget}</strong>? This action cannot be undone.</DialogContentText></DialogContent>
        <DialogActions><Button onClick={()=>setDeleteTarget(null)}>Cancel</Button><Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button></DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={()=>setSnack(null)} anchorOrigin={{ vertical:'bottom', horizontal:'center' }}>
        <Alert onClose={()=>setSnack(null)} severity={snack?.severity||'info'} sx={{ width:'100%', borderRadius:2 }}>{snack?.message}</Alert>
      </Snackbar>
    </Box>
  );
}
