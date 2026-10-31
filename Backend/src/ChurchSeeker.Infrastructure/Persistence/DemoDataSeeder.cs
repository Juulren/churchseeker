using ChurchSeeker.Application.Storage;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace ChurchSeeker.Infrastructure.Persistence;

// Sample content so the public experience has something to show. Only runs when Seed:Demo is true
// (never enabled in production config) and only fills a church that has no events yet.
public static class DemoDataSeeder
{
    private sealed record Demo(Guid ChurchId, string[] Members, (string Title, int Day, string Time, string Place)[] Events,
                               (string Title, string Body, bool Important)[] News, (string Title, string Author, string Color, int Thick, bool Public)[] Books);

    public static async Task SeedAsync(IServiceProvider services)
    {
        var demos = new[]
        {
            new Demo(ChurchSeedData.CathedralId,
                ["María del Carmen Pech", "José Luis Canul", "Rosa Elena Chan"],
                [("Misa dominical", 3, "09:00", "Nave principal"), ("Rosario comunitario", 6, "18:30", "Atrio"), ("Fiesta de San Ildefonso", 20, "11:00", "Plaza Grande")],
                [("Fiesta patronal", "Te esperamos en la fiesta de San Ildefonso con misa solemne y convivencia en la plaza.", true),
                 ("Catequesis abierta", "Inscripciones abiertas para niños de 7 a 12 años.", false)],
                [("Libro de bautismos 1750", "Archivo parroquial", "#6b3f2a", 8, true), ("Crónica de la catedral", "Cabildo eclesiástico", "#2f4a6b", 6, true), ("Actas del consejo (personal)", "Secretaría", "#3b3b3b", 4, false)]),
            new Demo(ChurchSeedData.SantaLuciaId,
                ["Luis Alberto May", "Teresa Uc Dzul", "Pedro Pablo Tun"],
                [("Misa de Santa Lucía", 2, "19:00", "Templo"), ("Serenata en el parque", 9, "20:00", "Parque de Santa Lucía"), ("Taller de música sacra", 14, "17:00", "Salón parroquial")],
                [("Serenata de Santa Lucía", "Música tradicional yucateca en el parque este viernes.", true), ("Colecta de víveres", "Recibimos donativos de lunes a sábado.", false)],
                [("Registro de matrimonios", "Archivo parroquial", "#7a2e3b", 7, true), ("Historia del barrio de Santa Lucía", "Comité vecinal", "#3f6b4a", 5, true), ("Libro de finanzas (personal)", "Tesorería", "#2b2b2b", 3, false)]),
            new Demo(ChurchSeedData.JesusId,
                ["Ana Sofía Cime", "Mateo Ek Balam", "Lucía Poot"],
                [("Vía Crucis", 4, "17:00", "Nave central"), ("Adoración nocturna", 8, "21:00", "Capilla"), ("Concierto de órgano", 18, "19:30", "Templo")],
                [("Restauración del retablo", "Avance de la restauración y cómo colaborar.", true), ("Horario de confesiones", "Martes y jueves de 17:00 a 19:00.", false)],
                [("Libro de la Tercera Orden", "Hermandad", "#5a3d6b", 9, true), ("Inventario de imágenes", "Conservación", "#6b5a2f", 6, true), ("Correspondencia (personal)", "Secretaría", "#333333", 4, false)])
        };

        foreach (var demo in demos)
        {
            using var scope = services.CreateScope();
            var sp = scope.ServiceProvider;
            // The normal tenant filter does the scoping: no filter bypass is needed.
            sp.GetRequiredService<PublicTenantScope>().Use(demo.ChurchId);
            var db = sp.GetRequiredService<AppDbContext>();
            if (await db.Events.AnyAsync()) continue;

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var memberIds = new List<Guid>();
            foreach (var name in demo.Members)
            {
                var m = new Member(demo.ChurchId, name, null, null, new DateOnly(2022, 1, 15), today);
                db.Members.Add(m);
                memberIds.Add(m.Id);
            }
            foreach (var (title, day, time, place) in demo.Events)
                db.Events.Add(new ChurchEvent(demo.ChurchId, title, "Evento de demostración.", today.AddDays(day), TimeOnly.Parse(time),
                    place, EventKind.Religioso, true, memberIds[0]));
            db.Events.Add(new ChurchEvent(demo.ChurchId, "Reunión de consejo (interna)", null, today.AddDays(5), new TimeOnly(19, 0),
                "Sala de juntas", EventKind.Administrativo, false, null));
            foreach (var (title, body, important) in demo.News)
                db.Announcements.Add(new Announcement(demo.ChurchId, title, body, today.AddDays(-1), null, important, true));
            db.Ministries.Add(new Ministry(demo.ChurchId, "Música", "Coro y alabanza.", null));
            db.Ministries.Add(new Ministry(demo.ChurchId, "Jóvenes", "Grupo juvenil.", null));

            var storage = sp.GetRequiredService<IFileStorage>();
            foreach (var (title, author, color, thick, isPublic) in demo.Books)
            {
                var pdf = MakePdf(title, author);
                var stored = await storage.SaveAsync(FileKind.Book, pdf, "pdf");
                db.ArchiveBooks.Add(new ChurchArchiveBook(demo.ChurchId, title, "Documento de demostración.", author, isPublic, color, thick, stored, pdf.Length));
            }
            await db.SaveChangesAsync();
        }
    }

    private static byte[] MakePdf(string title, string author)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        return Document.Create(doc =>
        {
            for (var page = 1; page <= 3; page++)
            {
                var n = page;
                doc.Page(p =>
                {
                    p.Margin(48);
                    p.Content().Column(c =>
                    {
                        c.Item().Text(title).FontSize(24).Bold();
                        c.Item().Text($"{author} · folio {n}").FontColor("#666666");
                        c.Item().PaddingTop(20).Text("Documento de demostración del Acervo Parroquial. En esta versión de prueba el contenido es ilustrativo.");
                    });
                });
            }
        }).GeneratePdf();
    }
}
