<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Cleans rich text HTML from the text editor against an allowlist, so no
 * scripts, event handlers or links can be saved and shown to other users.
 */
final class HtmlSanitizer
{
    /** Kept, with only a cleaned `style` attribute. */
    private const ALLOWED_TAGS = [
        'p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote',
    ];

    /** Removed together with everything inside them. Other unknown tags are unwrapped, keeping their text. */
    private const REMOVED_TAGS = [
        'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math',
        'form', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'base', 'head', 'title',
        'frame', 'frameset', 'applet',
    ];

    private const ALLOWED_CSS = [
        'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
        'text-align', 'color', 'background-color', 'line-height',
    ];

    public function clean(string $html): string
    {
        if (trim($html) === '') {
            return '';
        }

        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        // The xml encoding hint makes libxml read the input as UTF-8.
        $doc->loadHTML(
            '<?xml encoding="utf-8"?><div>' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementsByTagName('div')->item(0);
        if ($root === null) {
            return '';
        }
        $this->cleanChildren($root);

        $out = '';
        foreach ($root->childNodes as $child) {
            $out .= $doc->saveHTML($child);
        }
        return $out;
    }

    private function cleanChildren(\DOMNode $parent): void
    {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if ($node instanceof \DOMText && !$node instanceof \DOMCdataSection) {
                continue;
            }
            if (!$node instanceof \DOMElement) {
                $parent->removeChild($node); // comments, CDATA, processing instructions
                continue;
            }

            $tag = strtolower($node->tagName);
            if (in_array($tag, self::REMOVED_TAGS, true)) {
                $parent->removeChild($node);
                continue;
            }

            $this->cleanChildren($node);

            if (!in_array($tag, self::ALLOWED_TAGS, true)) {
                while ($node->firstChild !== null) {
                    $parent->insertBefore($node->firstChild, $node);
                }
                $parent->removeChild($node);
                continue;
            }

            $style = $this->cleanStyle($node->getAttribute('style'));
            while ($node->attributes->length > 0) {
                $node->removeAttributeNode($node->attributes->item(0));
            }
            if ($style !== '') {
                $node->setAttribute('style', $style);
            }
        }
    }

    private function cleanStyle(string $style): string
    {
        $rules = [];
        foreach (explode(';', $style) as $declaration) {
            if (!str_contains($declaration, ':')) {
                continue;
            }
            [$property, $value] = array_map('trim', explode(':', $declaration, 2));
            $property = strtolower($property);
            if (!in_array($property, self::ALLOWED_CSS, true)) {
                continue;
            }
            if (!preg_match('/^[a-z0-9#.,%\s()-]{1,64}$/i', $value)
                || preg_match('/url|expression|javascript|var\(|attr\(/i', $value)) {
                continue;
            }
            $rules[] = "$property: $value";
        }
        return implode('; ', $rules);
    }
}
