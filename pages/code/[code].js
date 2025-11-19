// pages/code/[code].js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/router";
import {
  AppBar,
  Toolbar,
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Tooltip,
  Divider,
  Stack,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Snackbar,
  useMediaQuery,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import LinkIcon from "@mui/icons-material/Link";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import QrCodeIcon from "@mui/icons-material/QrCode";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/FileDownload";
import RefreshIcon from "@mui/icons-material/Refresh";

import QRCode from "qrcode";

function formatDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function StatsPage() {
  const router = useRouter();
  const { code } = router.query;
  const isMobile = useMediaQuery("(max-width:768px)");

  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [snack, setSnack] = useState(null);

  // header search state (kept for visual consistency, doesn't drive this page)
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // fetch single link from backend
  const fetchLink = useCallback(async (c) => {
    if (!c) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(c)}`);
      if (res.status === 404) {
        throw new Error("Not found");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to load (${res.status})`);
      }
      const data = await res.json();
      setLink({
        code: data.code,
        url: data.url,
        clicks: typeof data.clicks === "number" ? data.clicks : Number(data.clicks || 0),
        lastClickedAt: data.lastClickedAt || null,
        createdAt: data.createdAt || null,
        clickHistory: data.clickHistory || null,
      });
    } catch (err) {
      console.error("fetch link:", err);
      setFetchError(err.message || "Failed to load");
      setLink(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // load when code changes
  useEffect(() => {
    if (!code) return;
    fetchLink(code);
  }, [code, fetchLink]);

  // --- NEW: generate QR as soon as the link is loaded (so preview is ready immediately)
  useEffect(() => {
    let cancelled = false;
    async function genForPreview() {
      if (!link) {
        setQrDataUrl(null);
        setQrLoading(false);
        return;
      }
      setQrLoading(true);
      try {
        // short URL to encode
        const toEncode = (base ? `${base}/` : `${origin}/`) + link.code;
        // generate a reasonably sized image (520px) so both preview and modal look sharp
        const data = await QRCode.toDataURL(toEncode, {
          margin: 2,
          width: 520,
          color: { dark: "#111827", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(data);
      } catch (err) {
        console.error("QR generation failed:", err);
        if (!cancelled) {
          setSnack({ severity: "error", message: "Failed to generate QR" });
          setQrDataUrl(null);
        }
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    }
    genForPreview();
    return () => {
      cancelled = true;
    };
  }, [link, base, origin]);

  // copy short link
  const handleCopy = async () => {
    if (!link) return;
    const full = base ? `${base}/${link.code}` : `${origin}/${link.code}`;
    try {
      await navigator.clipboard.writeText(full);
      setSnack({ severity: "success", message: "Copied short link" });
    } catch {
      setSnack({ severity: "error", message: "Copy failed" });
    }
  };

  // open original URL
  const handleOpenTarget = () => {
    if (!link) return;
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  // delete link
  const handleDelete = async () => {
    if (!link) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(link.code)}`, { method: "DELETE" });
      if (res.ok) {
        setSnack({ severity: "success", message: "Deleted" });
        setTimeout(() => router.push("/"), 600);
      } else {
        const err = await res.json().catch(() => ({}));
        setSnack({ severity: "error", message: err?.error || "Delete failed" });
      }
    } catch (err) {
      console.error("delete:", err);
      setSnack({ severity: "error", message: "Network error deleting" });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  // refresh (re-fetch)
  const handleRefresh = () => {
    if (!code) return;
    fetchLink(code);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc" }}>
      {/* AppBar — matches Dashboard header */}
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.main", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <Toolbar sx={{ gap: 2 }}>
          <LinkIcon sx={{ display: { xs: "none", sm: "block" } }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, fontSize: { xs: "1.05rem", sm: "1.25rem" } }}>
            TinyLink
          </Typography>

          {!isMobile ? (
            <TextField
              size="small"
              placeholder="Search by code or URL"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{
                bgcolor: "rgba(255,255,255,0.15)",
                borderRadius: 2,
                width: { sm: 280, md: 360 },
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { border: "none" },
                  color: "white",
                  "&::placeholder": { color: "rgba(255,255,255,0.7)" },
                },
              }}
            />
          ) : (
            <IconButton color="inherit" onClick={() => setSearchOpen(!searchOpen)}>
              <SearchIcon />
            </IconButton>
          )}

          <Tooltip title="Refresh">
            <IconButton color="inherit" onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Button color="inherit" onClick={() => router.push("/")}>Dashboard</Button>
        </Toolbar>

        {/* mobile search slide */}
        <Box>
          <Box sx={{ display: isMobile && searchOpen ? "block" : "none", px: 2, pb: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by code or URL"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchOpen(false)}>
                      <CloseIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                bgcolor: "rgba(255,255,255,0.15)",
                borderRadius: 2,
                "& .MuiOutlinedInput-root": { "& fieldset": { border: "none" }, color: "white" },
              }}
            />
          </Box>
        </Box>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ mb: 2 }}>
          <Button variant="text" onClick={() => router.push("/")}>
            ← Back to Dashboard
          </Button>
        </Box>

        <Paper sx={{ p: 3 }} elevation={2}>
          {loading ? (
            <Box>
              <Skeleton variant="text" width={260} height={36} />
              <Skeleton variant="rectangular" width="100%" height={160} sx={{ mt: 2 }} />
            </Box>
          ) : fetchError ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" color="error">
                {fetchError}
              </Typography>
              <Button sx={{ mt: 2 }} onClick={() => router.push("/")}>
                Back
              </Button>
            </Box>
          ) : link ? (
            <>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <Box>
                  <Typography variant="h5" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                    {link.code}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Short link:{" "}
                    <Tooltip title={link.code}>
                      <Box component="span" sx={{ fontFamily: "monospace" }}>
                        {(base ? `${base}/` : `${origin}/`) + link.code}
                      </Box>
                    </Tooltip>
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Tooltip title="Copy short link">
                    <IconButton onClick={handleCopy}>
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Show QR code">
                    <IconButton onClick={() => setQrOpen(true)}>
                      <QrCodeIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Open target URL">
                    <IconButton onClick={handleOpenTarget}>
                      <OpenInNewIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => setDeleteConfirmOpen(true)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Target URL
                  </Typography>
                  <Typography variant="body1" sx={{ wordBreak: "break-word", mt: 0.5 }}>
                    <a href={link.url} target="_blank" rel="noreferrer" style={{ color: "#1976d2", textDecoration: "none" }}>
                      {link.url}
                    </a>
                  </Typography>

                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Statistics
                    </Typography>

                    <Box sx={{ display: "flex", gap: 3, mt: 1, alignItems: "baseline", flexWrap: "wrap" }}>
                      <Box>
                        <Typography variant="h6">{link.clicks ?? 0}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Total clicks
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="h6">{link.lastClickedAt ? formatDate(link.lastClickedAt) : "—"}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last clicked
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="h6">{link.createdAt ? formatDate(link.createdAt) : "—"}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Created
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center", justifyContent: "flex-start" }}>
                  <Paper sx={{ p: 1, width: "100%", textAlign: "center" }}>
                    {/* PREVIEW: now shows QR automatically when available */}
                    {qrLoading ? (
                      <Skeleton variant="rectangular" width={220} height={220} />
                    ) : qrDataUrl ? (
                      <img src={qrDataUrl} alt="QR code" style={{ width: 220, height: 220, borderRadius: 8 }} />
                    ) : (
                      <Box sx={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                          QR preview
                        </Typography>
                      </Box>
                    )}
                  </Paper>

                  <Stack direction="row" spacing={1}>
                    <Button startIcon={<ContentCopyIcon />} onClick={handleCopy}>
                      Copy
                    </Button>
                    <Button
                      startIcon={<DownloadIcon />}
                      onClick={() => {
                        if (!qrDataUrl) {
                          setSnack({ severity: "error", message: "QR not ready" });
                          return;
                        }
                        const a = document.createElement("a");
                        a.href = qrDataUrl;
                        a.download = `tinylink-${link.code}.png`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setSnack({ severity: "success", message: "QR downloaded" });
                      }}
                    >
                      Download QR
                    </Button>
                  </Stack>
                </Box>
              </Box>
            </>
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography>No data</Typography>
            </Box>
          )}
        </Paper>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
          <DialogTitle>Delete short link</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete <strong>{code}</strong>? This will disable the redirect and remove stats.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="error" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Full-screen QR dialog (large) */}
        <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>QR for {link?.code}</DialogTitle>
          <DialogContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            {qrLoading ? (
              <Skeleton variant="rectangular" width={300} height={300} />
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" style={{ width: 300, height: 300, borderRadius: 8 }} />
            ) : (
              <Typography>No QR available</Typography>
            )}

            <Typography variant="body2" sx={{ wordBreak: "break-word", textAlign: "center" }}>
              {(base ? `${base}/` : `${typeof window !== "undefined" ? window.location.origin : ""}/`) + (link?.code || "")}
            </Typography>

            <Stack direction="row" spacing={1}>
              <Button onClick={handleCopy} startIcon={<ContentCopyIcon />}>
                Copy link
              </Button>
              <Button
                onClick={() => {
                  if (!qrDataUrl) {
                    setSnack({ severity: "error", message: "QR not ready" });
                    return;
                  }
                  const a = document.createElement("a");
                  a.href = qrDataUrl;
                  a.download = `tinylink-${link.code}.png`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setSnack({ severity: "success", message: "QR downloaded" });
                }}
                startIcon={<DownloadIcon />}
              >
                Download
              </Button>
              {typeof navigator !== "undefined" && navigator.share && (
                <Button
                  onClick={() =>
                    navigator
                      .share({ title: `TinyLink: ${link.code}`, text: link.code, url: (base ? `${base}/` : `${window.location.origin}/`) + link.code })
                      .catch(() => setSnack({ severity: "error", message: "Share failed or cancelled" }))
                  }
                >
                  Share
                </Button>
              )}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={() => setQrOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* snack */}
        <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack?.message} autoHideDuration={3000} />
      </Container>
    </Box>
  );
}
