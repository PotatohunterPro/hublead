routerAdd("POST", "/api/extract-card", (c) => {
    const data = $apis.requestInfo(c).data;
    let rawImages = [];

    if (Array.isArray(data.images) && data.images.length > 0) {
        rawImages = data.images;
    } else if (data.image) {
        rawImages = [data.image];
    } else {
        return c.json(400, { error: "Nenhuma imagem foi fornecida." });
    }

    const cleanedImages = rawImages.map(img => img.replace(/^data:image\/\w+;base64,/, ""));

    try {
        // Tenta conectar no IP padrão do gateway do Docker (172.17.0.1) ou host.docker.internal
        const res = $http.send({
            url: "http://172.17.0.1:11434/api/generate",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0",
                prompt: "Examine todas as imagens fornecidas (frente e/ou verso de cartão de visita) e consolide os dados em um único JSON estrito sem formatação markdown ou texto adicional. Use as chaves em minúsculo: \"nome_empresa\", \"nome_contato\", \"telefone\", \"whatsapp\", \"email\", \"site\", \"endereco\", \"cidade\", \"ramo_atividade\", \"redes_sociais\". Se não encontrar algo, deixe string vazia.",
                images: cleanedImages,
                stream: false
            }),
            timeout: 60
        });

        if (res.statusCode !== 200) {
            return c.json(500, { error: "Erro no serviço Ollama", status: res.statusCode });
        }

        const ollamaResponse = JSON.parse(res.raw);
        let extractedData = {};

        try {
            extractedData = JSON.parse(ollamaResponse.response);
        } catch (parseErr) {
            const match = ollamaResponse.response.match(/\{[\s\S]*\}/);
            if (match) {
                extractedData = JSON.parse(match[0]);
            } else {
                return c.json(422, { error: "Falha na estrutura da resposta da IA", raw: ollamaResponse.response });
            }
        }

        return c.json(200, { success: true, data: extractedData });

    } catch (err) {
        return c.json(500, { error: err.message });
    }
});
