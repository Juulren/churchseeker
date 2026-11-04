using System.Text;
using System.Text.RegularExpressions;

namespace ChurchSeeker.Infrastructure.Storage;

public readonly record struct FileCheck(bool Ok, string Extension, string ContentType, string? Error)
{
    public static FileCheck Pass(string ext, string contentType) => new(true, ext, contentType, null);
    public static FileCheck Fail(string error) => new(false, "", "", error);
}

// Validates by content (magic bytes), never by the client's file name or Content-Type header.
public static partial class FileValidator
{
    // Active-content markers that have no place in a scanned book. Names are normalised first so that
    // /J#61vaScript style obfuscation is still caught.
    [GeneratedRegex(@"/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|RichMedia|XFA|AA|GoToR|GoToE|SubmitForm|ImportData)(?![A-Za-z0-9])")]
    private static partial Regex ActivePdfContent();

    [GeneratedRegex("#([0-9A-Fa-f]{2})")]
    private static partial Regex HexEscape();

    public static FileCheck ValidatePdf(byte[] data)
    {
        if (data.Length < 16 || data[0] != '%' || data[1] != 'P' || data[2] != 'D' || data[3] != 'F' || data[4] != '-')
            return FileCheck.Fail("The file is not a PDF.");
        if (data[5] != '1' && data[5] != '2' || data[6] != '.')
            return FileCheck.Fail("Unsupported PDF version.");
        var tail = Encoding.Latin1.GetString(data, Math.Max(0, data.Length - 1024), Math.Min(1024, data.Length));
        if (!tail.Contains("%%EOF", StringComparison.Ordinal))
            return FileCheck.Fail("The PDF is truncated or corrupt.");

        var text = Encoding.Latin1.GetString(data);
        var normalised = HexEscape().Replace(text, m => ((char)Convert.ToInt32(m.Groups[1].Value, 16)).ToString());
        if (ActivePdfContent().IsMatch(normalised))
            return FileCheck.Fail("The PDF contains scripts, launch actions or embedded files and was rejected.");
        return FileCheck.Pass("pdf", "application/pdf");
    }

    public static FileCheck ValidateImage(byte[] d)
    {
        if (d.Length >= 8 && d[0] == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47 && d[4] == 0x0D && d[5] == 0x0A && d[6] == 0x1A && d[7] == 0x0A)
            return FileCheck.Pass("png", "image/png");
        if (d.Length >= 3 && d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF)
            return FileCheck.Pass("jpg", "image/jpeg");
        if (d.Length >= 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P')
            return FileCheck.Pass("webp", "image/webp");
        return FileCheck.Fail("The file is not a PNG, JPEG or WebP image.");
    }
}
