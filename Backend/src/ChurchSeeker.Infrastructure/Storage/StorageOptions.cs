namespace ChurchSeeker.Infrastructure.Storage;

public class StorageOptions
{
    public const string Section = "Storage";
    public string Root { get; set; } = "storage";
    public int MaxPdfBytes { get; set; } = 25 * 1024 * 1024;
    public int MaxImageBytes { get; set; } = 2 * 1024 * 1024;
}
