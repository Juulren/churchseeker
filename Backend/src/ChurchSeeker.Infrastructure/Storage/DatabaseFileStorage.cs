using ChurchSeeker.Application.Storage;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Storage;

/// <summary>
/// Keeps files in the database, for hosts with no persistent disk (Vercel + Neon). Scoped: it shares the DbContext of the
/// request, so the row is committed by the same SaveChanges as the record that points at it. This class never saves.
/// </summary>
public sealed class DatabaseFileStorage : IFileStorage
{
    private static readonly HashSet<string> AllowedExtensions = ["pdf", "png", "jpg", "webp"];
    private readonly AppDbContext _db;

    public DatabaseFileStorage(AppDbContext db) => _db = db;

    public Task<string> SaveAsync(FileKind kind, byte[] content, string extension, CancellationToken ct = default)
    {
        var ext = extension.TrimStart('.').ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext)) throw new ArgumentException("Extension not allowed.", nameof(extension));
        var name = $"{Guid.NewGuid():N}.{ext}";
        _db.StoredFiles.Add(new StoredFile(name, kind, content));
        return Task.FromResult(name);
    }

    public async Task<Stream?> OpenReadAsync(FileKind kind, string storedName, CancellationToken ct = default)
    {
        if (!LocalFileStorage.IsStoredName(storedName)) return null;
        var bytes = await _db.StoredFiles.AsNoTracking().Where(f => f.Name == storedName && f.Kind == kind).Select(f => f.Content).FirstOrDefaultAsync(ct);
        return bytes is null ? null : new MemoryStream(bytes, writable: false);
    }

    public async Task DeleteAsync(FileKind kind, string storedName, CancellationToken ct = default)
    {
        if (!LocalFileStorage.IsStoredName(storedName)) return;
        var row = await _db.StoredFiles.FirstOrDefaultAsync(f => f.Name == storedName && f.Kind == kind, ct);
        if (row is not null) _db.StoredFiles.Remove(row);
    }
}
