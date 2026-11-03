using System.Text;
using System.Text.Json;
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

    // Extensions a viewer here can read: the compressions (Draco, meshopt), quantised meshes and the common material and
    // texture ones. A model that REQUIRES anything else would not load, so it is refused when it is uploaded.
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.Ordinal)
    {
        "KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform",
        "KHR_materials_unlit", "KHR_materials_emissive_strength", "EXT_texture_webp"
    };

    /// <summary>
    /// A binary glTF (.glb): the header, a JSON chunk that must parse, a version 2 asset, only extensions the viewer can read,
    /// and no more than <paramref name="maxTriangles"/> triangles (counted from the accessors, once per node that uses the mesh, so no mesh data is decoded). Draco
    /// models state their counts in the JSON but the decoder ignores them, so for those the size cap is the real limit.
    /// </summary>
    public static FileCheck ValidateGlb(byte[] d, int maxTriangles = 80_000)
    {
        // Binary glTF: "glTF", version 2, total length equal to the file length.
        if (d.Length < 20 || d[0] != 'g' || d[1] != 'l' || d[2] != 'T' || d[3] != 'F')
            return FileCheck.Fail("The file is not a binary glTF (.glb) model.");
        var version = BitConverter.ToUInt32(d, 4);
        var length = BitConverter.ToUInt32(d, 8);
        if (version != 2 || length != (uint)d.Length)
            return FileCheck.Fail("The .glb header is invalid.");

        // The first chunk is the JSON that describes the scene.
        var jsonLength = BitConverter.ToUInt32(d, 12);
        var chunkType = BitConverter.ToUInt32(d, 16);
        if (chunkType != 0x4E4F534Au || jsonLength == 0 || jsonLength > (uint)(d.Length - 20))
            return FileCheck.Fail("The .glb has no readable model data.");

        try
        {
            using var doc = JsonDocument.Parse(new ReadOnlyMemory<byte>(d, 20, (int)jsonLength), new JsonDocumentOptions { MaxDepth = 32 });
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return FileCheck.Fail("The .glb model data is invalid.");

            if (!root.TryGetProperty("asset", out var asset) || asset.ValueKind != JsonValueKind.Object
                || !asset.TryGetProperty("version", out var v) || v.ValueKind != JsonValueKind.String || !(v.GetString() ?? "").StartsWith("2"))
                return FileCheck.Fail("The .glb must be glTF version 2.");

            if (root.TryGetProperty("extensionsRequired", out var req) && req.ValueKind == JsonValueKind.Array)
                foreach (var e in req.EnumerateArray())
                    if (e.ValueKind != JsonValueKind.String || !AllowedExtensions.Contains(e.GetString() ?? ""))
                        return FileCheck.Fail("The .glb needs an extension the viewer cannot read (" + (e.ValueKind == JsonValueKind.String ? e.GetString() : "?") + "). Export it again with Draco or meshopt compression only.");

            var accessors = root.TryGetProperty("accessors", out var acc) && acc.ValueKind == JsonValueKind.Array ? acc : default;
            var perMesh = new List<long>();
            if (root.TryGetProperty("meshes", out var meshes) && meshes.ValueKind == JsonValueKind.Array)
                foreach (var mesh in meshes.EnumerateArray())
                {
                    long mine = 0;
                    if (mesh.TryGetProperty("primitives", out var prims) && prims.ValueKind == JsonValueKind.Array)
                        foreach (var p in prims.EnumerateArray())
                        {
                            var mode = 4;
                            if (p.TryGetProperty("mode", out var m))
                            {
                                if (m.ValueKind != JsonValueKind.Number || !m.TryGetInt32(out mode) || mode < 0 || mode > 6)
                                    return FileCheck.Fail("The .glb model data is invalid.");
                            }
                            if (mode < 4) continue; // points and lines have no triangles
                            long count = 0;
                            if (p.TryGetProperty("indices", out var idx) && idx.ValueKind == JsonValueKind.Number && idx.TryGetInt32(out var ii))
                                count = AccessorCount(accessors, ii, maxTriangles);
                            if (count == 0 && p.TryGetProperty("attributes", out var at) && at.ValueKind == JsonValueKind.Object
                                && at.TryGetProperty("POSITION", out var pos) && pos.ValueKind == JsonValueKind.Number && pos.TryGetInt32(out var pi))
                                count = AccessorCount(accessors, pi, maxTriangles);
                            mine += mode == 4 ? count / 3 : Math.Max(count - 2, 0);
                        }
                    perMesh.Add(mine);
                }

            // A mesh is drawn once per node that uses it; a file whose nodes use none of them is counted mesh by mesh.
            long triangles = 0;
            var used = false;
            if (root.TryGetProperty("nodes", out var nodes) && nodes.ValueKind == JsonValueKind.Array)
                foreach (var node in nodes.EnumerateArray())
                    if (node.ValueKind == JsonValueKind.Object && node.TryGetProperty("mesh", out var mi) && mi.ValueKind == JsonValueKind.Number
                        && mi.TryGetInt32(out var meshIndex) && meshIndex >= 0 && meshIndex < perMesh.Count)
                    {
                        used = true;
                        triangles += perMesh[meshIndex]; // each term is bounded, so this cannot overflow before the check
                        if (triangles > maxTriangles) break;
                    }
            if (!used) triangles = perMesh.Sum();
            if (triangles > maxTriangles)
                return FileCheck.Fail($"The model has more than {maxTriangles:N0} triangles. Simplify it first (see the guide in Configuración).");
        }
        catch (JsonException) { return FileCheck.Fail("The .glb model data is invalid."); }
        catch (InvalidOperationException) { return FileCheck.Fail("The .glb model data is invalid."); }

        return FileCheck.Pass("glb", "model/gltf-binary");
    }

    /// <summary>The accessor's element count, capped so that summing many of them cannot overflow.</summary>
    private static long AccessorCount(JsonElement accessors, int index, int maxTriangles)
    {
        if (accessors.ValueKind != JsonValueKind.Array || index < 0 || index >= accessors.GetArrayLength()) return 0;
        var a = accessors[index];
        return a.ValueKind == JsonValueKind.Object && a.TryGetProperty("count", out var c) && c.ValueKind == JsonValueKind.Number && c.TryGetInt64(out var n) && n > 0 ? Math.Min(n, 3L * maxTriangles + 3) : 0;
    }
}
