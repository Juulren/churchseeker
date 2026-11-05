namespace ChurchSeeker.Infrastructure.Storage;

public class StorageOptions
{
    public const string Section = "Storage";
    /// <summary>"Local" (files in <see cref="Root"/>) or "Database" (files in the StoredFiles table).</summary>
    public string Provider { get; set; } = "Local";
    public string Root { get; set; } = "storage";
    // 4 MiB: Vercel rejects request bodies over 4.5 MB, and the multipart envelope needs some room.
    public int MaxPdfBytes { get; set; } = 4 * 1024 * 1024;
    public int MaxImageBytes { get; set; } = 2 * 1024 * 1024;
}
